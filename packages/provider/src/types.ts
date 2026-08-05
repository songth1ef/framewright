/**
 * AI 生成能力的接口定义（Provider 抽象）。
 *
 * 设计出处：`docs/domain.md` §4（Generation 生命周期）与 `docs/backend-domain.md` §6。
 * 硬约束（`AGENTS.md` §2）：provider 必须可替换——调用方只认这里的接口，
 * 仓内只保留 mock 实现（`mock-provider.ts`），真实厂商实现留空。
 */

/** 生成类型，与 `docs/backend-domain.md` §5 的 `Generation.kind` 对齐。 */
export type GenerationKind =
  | 'text-to-image'
  | 'image-to-image'
  | 'text-to-video'
  | 'image-to-video'

/**
 * 生成任务四态。
 *
 * 与前端生成单元（`docs/domain.md` §3.2.1）的 `status` 一一对应：
 * 前端多出的 `'empty'` 是「尚未 submit」的本地状态，不是 provider 状态；
 * provider 的 pending/running/succeeded/failed 直接驱动前端同名四态。
 */
export type GenerationTaskStatus = 'pending' | 'running' | 'succeeded' | 'failed'

/** 提交生成的参数。`options` 形状由具体 provider 决定，原样留存供查看与复跑。 */
export interface GenerationParams {
  kind: GenerationKind
  prompt: string
  /** 图生图 / 图生视频的参考素材 URL；文生类为空或省略。 */
  inputAssetUrls?: readonly string[]
  /** 模型、尺寸、时长、种子等。 */
  options?: Record<string, unknown>
}

/** 生成产出的一个素材。 */
export interface GeneratedAsset {
  url: string
  kind: 'image' | 'video'
  width: number | null
  height: number | null
}

/** 一次生成任务的生命周期快照（poll 的返回值）。 */
export interface GenerationTask {
  id: string
  kind: GenerationKind
  status: GenerationTaskStatus
  /** 提交时的参数，原样留存（`docs/domain.md` §4 硬要求）。 */
  params: GenerationParams
  /** 成功时的产出素材列表；非 succeeded 为 null。 */
  result: readonly GeneratedAsset[] | null
  /** 失败原因；非 failed 为 null。 */
  error: string | null
  createdAt: string
  finishedAt: string | null
}

/**
 * 生成方抽象。异步流程：submit 拿 taskId，前端按 taskId 轮询 poll 直到终态。
 * 不假设同步返回结果（`docs/domain.md` §4）。
 */
export interface GenerationProvider {
  readonly name: string
  submit(params: GenerationParams): Promise<string>
  poll(taskId: string): Promise<GenerationTask>
}

export type ProviderErrorCode = 'unknown-task'

/** provider 层统一抛出的错误；`code` 供调用方机器判定（如区分「任务不存在」与网络错误）。 */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode

  constructor(code: ProviderErrorCode, message: string) {
    super(message)
    this.name = 'ProviderError'
    this.code = code
  }
}
