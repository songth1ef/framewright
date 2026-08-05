import { NODE_ACTIONS, type GenerationStatus, type NodeActionName } from '@framewright/core'
import {
  assetContentUrl,
  buildSubmitFromNode,
  createGenerationRunner,
  type GenerationBackend,
  type GenerationDto,
  type GenerationRun,
} from './generation-flow'
import type { AiImageNode, AiVideoNode } from '@framewright/core'

/**
 * G2-3：把渲染器上报的节点动作（generate / retry / regenerate）接到生成
 * 流程上，并把每次状态同步翻译成对节点字段的补丁，交回 host 落画布。
 *
 * 🔴 安全底线（`docs/backend-domain.md` §6）：`handleAction` 是本模块唯一
 * 的提交入口，它只能由渲染器的按钮回调驱动——即用户显式点击「生成 /
 * 重试 / 重新生成」。模块内没有任何定时器或自动流程会发起 submit；
 * 轮询只调 `poll`（见 `generation-flow.ts` 的同款约束）。
 *
 * 状态补丁**不经过撤销历史**：pending → running → 终态是服务端驱动的
 * 同步，不是用户的画布编辑；进撤销栈只会制造「撤销一次生成中状态」的
 * 噪音。host 侧用不带 history record 的路径应用（见 renderer-host）。
 */

export type GenerationUnitNode = AiImageNode | AiVideoNode

/** 一次状态同步要落到节点上的字段子集。 */
export interface GenerationNodePatch {
  status: GenerationStatus
  /** succeeded 时指向素材内容路由；其余时刻不改写。 */
  src?: string | null
  errorMessage?: string | null
}

const GENERATION_ACTIONS: readonly NodeActionName[] = [
  NODE_ACTIONS.generate,
  NODE_ACTIONS.retry,
  NODE_ACTIONS.regenerate,
]

export function isGenerationAction(action: string): action is NodeActionName {
  return (GENERATION_ACTIONS as readonly string[]).includes(action)
}

/** 把一次生成记录快照翻译成节点补丁；终态后不再产生新补丁。 */
export function patchFromGeneration(generation: GenerationDto): GenerationNodePatch {
  switch (generation.status) {
    case 'pending':
    case 'running':
      return { status: generation.status, errorMessage: null }
    case 'failed':
      return { status: 'failed', errorMessage: generation.errorMessage ?? '生成失败' }
    case 'succeeded': {
      const assetId = generation.outputAssetIds[0]
      // 成功但没有产出素材是编排层异常，按失败呈现而不是渲染一张裂图
      if (assetId === undefined) {
        return { status: 'failed', errorMessage: '生成成功但未返回素材' }
      }
      return { status: 'succeeded', src: assetContentUrl(assetId), errorMessage: null }
    }
  }
}

export interface GenerationControllerDeps {
  backend: GenerationBackend
  /** 轮询间隔（毫秒），测试传 0；默认走 generation-flow 的 1000。 */
  pollIntervalMs?: number
  /** demo 模式（无 documentId）返回 undefined，此时无法提交。 */
  getDocumentId(): string | undefined
  getNode(fwId: string): GenerationUnitNode | null
  /** 把补丁落回画布；host 负责构造 update-node op（不经撤销历史）。 */
  onNodePatch(fwId: string, patch: GenerationNodePatch): void
  /** submit / poll 抛错（含路由未就绪的 HTTP 错误）；节点已被置为 failed。 */
  onError?(fwId: string, error: unknown): void
}

export interface GenerationController {
  /**
   * 🔴 唯一提交入口，只允许由用户点击触发。
   * 返回 true 表示该动作已被生成流程接管。
   */
  handleAction(fwId: string, action: string): boolean
  /** 节点被删除 / 文档切换时取消它在途的轮询。 */
  cancelNode(fwId: string): void
  /** 卸载时取消全部在途轮询。 */
  dispose(): void
}

export function createGenerationController(deps: GenerationControllerDeps): GenerationController {
  const runner = createGenerationRunner({
    backend: deps.backend,
    ...(deps.pollIntervalMs !== undefined ? { pollIntervalMs: deps.pollIntervalMs } : {}),
  })
  /** fwId → 在途轮询句柄；同步登记，挡住连点重复提交。 */
  const activeRuns = new Map<string, GenerationRun>()

  return {
    handleAction(fwId, action) {
      if (!isGenerationAction(action)) return false
      const node = deps.getNode(fwId)
      if (node === null) return false
      const documentId = deps.getDocumentId()
      if (documentId === undefined) {
        deps.onError?.(fwId, new Error('缺少 documentId，无法提交生成'))
        return true
      }

      // 同一节点已有在途轮询时忽略重复触发——pending/running 下卡片没有
      // 可点的生成按钮，这是防「连点重复提交花钱任务」的最后一道兜底
      if (activeRuns.has(fwId)) return true

      const request = { documentId, params: buildSubmitFromNode(node) }
      // 乐观置 pending：点完立刻有反馈，不等 submit 网络往返
      deps.onNodePatch(fwId, { status: 'pending', errorMessage: null })

      const finish = (): void => {
        activeRuns.delete(fwId)
      }
      const run = runner.start(request, {
        onSnapshot: (generation) => {
          deps.onNodePatch(fwId, patchFromGeneration(generation))
          if (generation.status === 'succeeded' || generation.status === 'failed') finish()
        },
        onError: (error) => {
          deps.onNodePatch(fwId, {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : '生成请求失败',
          })
          deps.onError?.(fwId, error)
          finish()
        },
      })
      activeRuns.set(fwId, run)
      return true
    },

    cancelNode(fwId) {
      activeRuns.get(fwId)?.cancel()
      activeRuns.delete(fwId)
    },

    dispose() {
      for (const run of activeRuns.values()) run.cancel()
      activeRuns.clear()
    },
  }
}
