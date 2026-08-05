/**
 * 生成任务编排层（`docs/backend-domain.md` §5/§6）。
 *
 * 职责：把 `GenerationProvider`（packages/provider）的 submit/poll 流程接进
 * server-core——落 Generation 记录、同步状态、成功时把产物下载落成本地
 * Asset 并回填 `outputAssetIds`。
 *
 * 给调用方（apps/web 的 Route Handler，G3-5）的约定：
 * - 本层是纯 TS，不碰任何 Web 框架概念；默认依赖由 server-core 的
 *   composition root 统一组装，Route Handler 只调用导出的业务函数。
 * - 🔴 产品安全底线：`submitGeneration` 是**显式入口**，只允许在「用户确认了
 *   生成计划」之后由 Route Handler 调用；LLM 或任何自动流程（含轮询）都
 *   不许触发它——轮询只有 `pollGeneration` 一条路，它永不提交新任务。
 *
 * 依赖注入说明：工厂继续只认结构化接口 `GenerationProviderPort`，与
 * provider 的 `GenerationProvider` 字段形状一致；默认 mock 实现仅在
 * composition root 组装，将来替换真实厂商只需改该处。
 */

import { randomUUID } from 'node:crypto'
import type { AssetStorage } from './asset-storage'
import type { AssetStore } from './asset-store'
import type { GenerationKind, GenerationStatus, GenerationStore, StoredGeneration } from './generation-store'

/** 提交生成的参数，形状与 provider 包的 `GenerationParams` 一致。 */
export interface GenerationSubmitParams {
  kind: GenerationKind
  prompt: string
  /** 图生图 / 图生视频的参考素材 URL；文生类为空或省略。 */
  inputAssetUrls?: readonly string[]
  /** 模型、尺寸、时长、种子等，原样留存供查看与复跑。 */
  options?: Record<string, unknown>
}

/** 生成产出的一个素材（provider 返回的形状）。 */
export interface GeneratedAssetPayload {
  url: string
  kind: 'image' | 'video'
  width: number | null
  height: number | null
}

/** poll 返回的任务快照（provider `GenerationTask` 的子集，按需取用）。 */
export interface GenerationTaskSnapshot {
  id: string
  kind: GenerationKind
  status: GenerationStatus
  result: readonly GeneratedAssetPayload[] | null
  error: string | null
}

/** provider 抽象的结构化镜像，与 `@framewright/provider` 的 `GenerationProvider` 兼容。 */
export interface GenerationProviderPort {
  readonly name: string
  submit(params: GenerationSubmitParams): Promise<string>
  poll(taskId: string): Promise<GenerationTaskSnapshot>
}

/** 下载产物字节的返回。 */
export interface FetchedAssetData {
  data: Uint8Array
  mimeType: string
}

export type AssetFetcher = (url: string) => Promise<FetchedAssetData>

export interface GenerationServiceDeps {
  provider: GenerationProviderPort
  generationStore: GenerationStore
  assetStore: AssetStore
  storage: AssetStorage
  /** 产物下载器，默认走全局 fetch；测试注入假实现。 */
  fetchAsset?: AssetFetcher
  /** asset id 生成器，默认 randomUUID；测试注入以获得确定 id。 */
  idFactory?: () => string
}

export interface SubmitGenerationInput {
  projectId: string
  documentId: string
  /** 经对话发起时带上，供回溯 */
  sessionId?: string
  messageId?: string
  params: GenerationSubmitParams
  inputAssetIds?: readonly string[]
}

export interface SubmittedGeneration {
  generation: StoredGeneration
  /** provider 侧任务 id，轮询时凭它查状态。 */
  taskId: string
}

export interface GenerationService {
  /**
   * 🔴 提交生成任务（花钱入口）。只允许在用户确认生成计划后显式调用。
   * 先落 pending 记录再调 provider.submit，返回记录与 taskId。
   */
  submitGeneration(input: SubmitGenerationInput): Promise<SubmittedGeneration>
  /**
   * 轮询一次：同步 pending/running 状态；到 succeeded 时把产物落成 Asset
   * 并回填 outputAssetIds，到 failed 时回填 errorMessage。
   * 幂等：记录已到终态时直接返回，不再调 provider、不重复落素材。
   *
   * taskId 可省略（同进程内 submit 过的任务有内存映射）；进程重启后映射
   * 丢失，须显式传入——见报告中的已知限制（Generation 表暂无 taskId 列）。
   */
  pollGeneration(generationId: string, taskId?: string): Promise<StoredGeneration>
}

export type GenerationServiceErrorCode = 'unknown-generation'

/** 生成编排层的稳定错误；code 供 HTTP 等调用方做机器判定。 */
export class GenerationServiceError extends Error {
  constructor(
    readonly code: GenerationServiceErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'GenerationServiceError'
  }
}

/** 常见产物的 MIME → 扩展名；未识别的 MIME 不加扩展名。 */
const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
}

const TERMINAL_STATUSES: readonly GenerationStatus[] = ['succeeded', 'failed']

async function defaultFetchAsset(url: string): Promise<FetchedAssetData> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`下载生成产物失败：HTTP ${res.status}（${url}）`)
  }
  const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream'
  return { data: new Uint8Array(await res.arrayBuffer()), mimeType }
}

export function createGenerationService(deps: GenerationServiceDeps): GenerationService {
  const fetchAsset = deps.fetchAsset ?? defaultFetchAsset
  const idFactory = deps.idFactory ?? randomUUID
  /** generationId → provider taskId 的进程内映射（见接口注释的已知限制）。 */
  const taskIdByGeneration = new Map<string, string>()

  return {
    async submitGeneration(input) {
      const generation = await deps.generationStore.createGeneration({
        projectId: input.projectId,
        documentId: input.documentId,
        ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
        ...(input.messageId === undefined ? {} : { messageId: input.messageId }),
        kind: input.params.kind,
        params: { ...input.params },
        ...(input.inputAssetIds === undefined ? {} : { inputAssetIds: input.inputAssetIds }),
      })
      const taskId = await deps.provider.submit(input.params)
      taskIdByGeneration.set(generation.id, taskId)
      return { generation, taskId }
    },

    async pollGeneration(generationId, taskId) {
      const current = await deps.generationStore.getGeneration(generationId)
      if (current === null) {
        throw new GenerationServiceError('unknown-generation', `未知的生成记录：${generationId}`)
      }
      // 幂等守卫：已终态直接返回，重复 poll 不产生重复素材
      if (TERMINAL_STATUSES.includes(current.status)) {
        return current
      }

      const resolvedTaskId = taskId ?? taskIdByGeneration.get(generationId)
      if (resolvedTaskId === undefined) {
        throw new Error(
          `找不到生成记录 ${generationId} 对应的 provider taskId` +
            '（进程重启后内存映射丢失，请显式传入 taskId）',
        )
      }

      const snapshot = await deps.provider.poll(resolvedTaskId)

      if (snapshot.status === 'pending' || snapshot.status === 'running') {
        return deps.generationStore.updateGenerationStatus(generationId, snapshot.status)
      }
      if (snapshot.status === 'failed') {
        return deps.generationStore.updateGenerationStatus(generationId, 'failed', {
          errorMessage: snapshot.error ?? '生成失败（provider 未给出原因）',
        })
      }

      // succeeded：下载产物 → 写存储 → 落 Asset 记录 → 回填 outputAssetIds
      const outputAssetIds: string[] = []
      for (const payload of snapshot.result ?? []) {
        const { data, mimeType } = await fetchAsset(payload.url)
        const assetId = idFactory()
        const storageKey = `${current.projectId}/${assetId}${EXT_BY_MIME[mimeType] ?? ''}`
        await deps.storage.put(storageKey, data, mimeType)
        const asset = await deps.assetStore.createAsset({
          id: assetId,
          projectId: current.projectId,
          kind: payload.kind,
          origin: 'generated',
          storageKey,
          mimeType,
          byteSize: data.byteLength,
          ...(payload.width === null ? {} : { width: payload.width }),
          ...(payload.height === null ? {} : { height: payload.height }),
          generationId,
        })
        outputAssetIds.push(asset.id)
      }
      return deps.generationStore.updateGenerationStatus(generationId, 'succeeded', {
        outputAssetIds,
      })
    },
  }
}
