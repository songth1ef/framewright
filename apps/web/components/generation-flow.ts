import type { AiImageNode, AiVideoNode } from '@framewright/core'

/**
 * G2-3：画布侧生成流程的纯逻辑层（`docs/backend-domain.md` §5/§6）。
 *
 * 职责：把 host 的 `onNodeAction`（generate / retry / regenerate）接到后端
 * 生成链路上——提交、按间隔轮询、把每次状态同步上报给调用方，由调用方
 * （renderer-host）转成 `update-node` op 落回画布，让节点四态真实流转。
 *
 * 🔴 本层没有也不许有任何「自动触发提交」的路径：`start` 只能由用户的
 * 显式动作（点「生成/重试」或参数面板的「确认生成」按钮）调用；轮询只
 * 调 `poll`，永不提交新任务（与 server-core 编排层同一条安全底线）。
 *
 * 后端抽象 `GenerationBackend` 默认走 HTTP（见 `generation-client.ts`），
 * 其契约镜像 server-core 编排层 `submitGeneration` / `pollGeneration`
 * （commit 0825a71）的函数签名；测试注入假实现。
 */

/** 生成记录中前端关心的字段（server-core `StoredGeneration` 的子集）。 */
export interface GenerationDto {
  id: string
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  outputAssetIds: readonly string[]
  errorMessage: string | null
}

/** 形状对齐 server-core 的 `GenerationSubmitParams`。 */
export interface GenerationSubmitParamsDto {
  kind: 'text-to-image' | 'image-to-image' | 'text-to-video' | 'image-to-video'
  prompt: string
  options?: Record<string, unknown>
}

/** 形状对齐 server-core 的 `SubmitGenerationInput`（projectId 由路由侧按 document 解析）。 */
export interface SubmitGenerationRequest {
  documentId: string
  sessionId?: string
  params: GenerationSubmitParamsDto
  inputAssetIds?: readonly string[]
}

/** 形状对齐 server-core 的 `SubmittedGeneration`。 */
export interface SubmittedGenerationDto {
  generation: GenerationDto
  taskId: string
}

export interface GenerationBackend {
  submit(request: SubmitGenerationRequest): Promise<SubmittedGenerationDto>
  poll(generationId: string, taskId?: string): Promise<GenerationDto>
}

type GenerationUnitNode = AiImageNode | AiVideoNode

function kindForNode(node: GenerationUnitNode): GenerationSubmitParamsDto['kind'] {
  // 图生图 / 图生视频要等 G2-5 派生生成把输入素材接上；当前一律文生类
  return node.fwType === 'ai-image' ? 'text-to-image' : 'text-to-video'
}

/** 用节点上留存的 prompt / params 组装提交参数（retry 的路径）。 */
export function buildSubmitFromNode(node: GenerationUnitNode): GenerationSubmitParamsDto {
  return { kind: kindForNode(node), prompt: node.prompt, options: { ...node.params } }
}

/** 参数面板确认后的表单值。 */
export interface GenerationFormValues {
  prompt: string
  model: string
  size: string
  /** 秒，仅视频节点有意义。 */
  duration?: string
}

/** 用面板确认后的表单值组装提交参数（generate / regenerate 的路径）。 */
export function buildSubmitFromForm(
  node: GenerationUnitNode,
  values: GenerationFormValues,
): GenerationSubmitParamsDto {
  const options: Record<string, unknown> = { model: values.model, size: values.size }
  if (node.fwType === 'ai-video' && values.duration !== undefined) {
    options['duration'] = Number(values.duration)
  }
  return { kind: kindForNode(node), prompt: values.prompt, options }
}

/** 生成成功后节点 `src` 指向的素材内容路由。 */
export function assetContentUrl(assetId: string): string {
  return `/api/assets/${encodeURIComponent(assetId)}`
}

export interface GenerationRunCallbacks {
  /** submit 成功与每次 poll 后各调一次；到终态后不再调用。 */
  onSnapshot(generation: GenerationDto, taskId: string): void
  /** submit / poll 抛错（含路由不存在等 HTTP 错误）。 */
  onError?(error: unknown): void
}

export interface GenerationRun {
  /** 取消后不再 poll、不再上报；已在途的请求结果会被丢弃。 */
  cancel(): void
}

export interface GenerationRunnerDeps {
  backend: GenerationBackend
  /** 轮询间隔（毫秒），默认 1000。 */
  pollIntervalMs?: number
}

export function createGenerationRunner(deps: GenerationRunnerDeps) {
  const interval = deps.pollIntervalMs ?? 1000
  return {
    /**
     * 🔴 花钱入口的客户端侧：只允许由用户显式动作触发。
     * 提交一次并轮询到终态；返回句柄可取消（节点被删、发起新一次生成时）。
     */
    start(request: SubmitGenerationRequest, callbacks: GenerationRunCallbacks): GenerationRun {
      let cancelled = false
      let timer: ReturnType<typeof setTimeout> | null = null

      const run = async (): Promise<void> => {
        try {
          const { generation, taskId } = await deps.backend.submit(request)
          if (cancelled) return
          callbacks.onSnapshot(generation, taskId)
          let current = generation
          while (current.status === 'pending' || current.status === 'running') {
            await new Promise<void>((resolve) => {
              timer = setTimeout(resolve, interval)
            })
            timer = null
            if (cancelled) return
            current = await deps.backend.poll(current.id, taskId)
            if (cancelled) return
            callbacks.onSnapshot(current, taskId)
          }
        } catch (error) {
          if (!cancelled) callbacks.onError?.(error)
        }
      }
      void run()

      return {
        cancel() {
          cancelled = true
          if (timer !== null) clearTimeout(timer)
        },
      }
    },
  }
}
