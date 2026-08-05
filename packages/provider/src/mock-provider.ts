import {
  ProviderError,
  type GeneratedAsset,
  type GenerationKind,
  type GenerationParams,
  type GenerationProvider,
  type GenerationTask,
  type GenerationTaskStatus,
} from './types'

export interface MockProviderOptions {
  /** submit / poll 每次调用的模拟网络延迟（毫秒），默认 0。 */
  delayMs?: number
  /** poll 多少次后从 pending 转 running，默认 1。 */
  pendingPolls?: number
  /** running 再保持多少次 poll 后进入终态，默认 1。 */
  runningPolls?: number
  /** 进入终态时的失败率，0–1，默认 0。判定时机在「转终态那一次 poll」，与真实厂商一致。 */
  failureRate?: number
  /** 随机数源，默认 `Math.random`；测试注入以获得确定的成败。 */
  random?: () => number
  /** taskId 生成器，默认自增 `mock-task-N`。 */
  idFactory?: () => string
  /** 占位素材 URL 工厂，默认走公开占位图服务 placehold.co（中立、无厂商信息）。 */
  placeholderUrl?: (taskId: string, kind: GenerationKind) => string
}

interface MockTaskRecord {
  id: string
  kind: GenerationKind
  params: GenerationParams
  createdAt: string
  polls: number
  status: GenerationTaskStatus
  result: readonly GeneratedAsset[] | null
  error: string | null
  finishedAt: string | null
}

const VIDEO_KINDS: readonly GenerationKind[] = ['text-to-video', 'image-to-video']

function defaultPlaceholderUrl(taskId: string, kind: GenerationKind): string {
  // ⚠️ 视频类任务给的也是占位图 URL，不可播放——mock 的职责是驱动四态流转，
  // 可播放的真实视频 URL 是 P3 接真实 provider 时的事。
  const size = VIDEO_KINDS.includes(kind) ? '1024x576' : '1024x1024'
  return `https://placehold.co/${size}?text=${taskId}`
}

function defaultErrorMessage(kind: GenerationKind): string {
  return `mock 生成失败（${kind}，模拟失败率命中）`
}

/**
 * 可替换的 mock 生成方：模拟真实异步流程（submit → pending → running → 终态），
 * 延迟、状态推进节奏、失败率均可配置。零外部依赖，纯内存实现。
 */
export class MockGenerationProvider implements GenerationProvider {
  readonly name = 'mock'

  private readonly delayMs: number
  private readonly pendingPolls: number
  private readonly runningPolls: number
  private readonly failureRate: number
  private readonly random: () => number
  private readonly idFactory: () => string
  private readonly placeholderUrl: (taskId: string, kind: GenerationKind) => string

  private readonly tasks = new Map<string, MockTaskRecord>()

  constructor(options: MockProviderOptions = {}) {
    this.delayMs = options.delayMs ?? 0
    this.pendingPolls = options.pendingPolls ?? 1
    this.runningPolls = options.runningPolls ?? 1
    this.failureRate = options.failureRate ?? 0
    this.random = options.random ?? Math.random
    let seq = 0
    this.idFactory = options.idFactory ?? (() => `mock-task-${++seq}`)
    this.placeholderUrl = options.placeholderUrl ?? defaultPlaceholderUrl
  }

  async submit(params: GenerationParams): Promise<string> {
    await this.delay()
    const id = this.idFactory()
    this.tasks.set(id, {
      id,
      kind: params.kind,
      params,
      createdAt: new Date().toISOString(),
      polls: 0,
      status: 'pending',
      result: null,
      error: null,
      finishedAt: null,
    })
    return id
  }

  async poll(taskId: string): Promise<GenerationTask> {
    const task = this.tasks.get(taskId)
    if (!task) {
      throw new ProviderError('unknown-task', `未知的生成任务：${taskId}`)
    }
    await this.delay()
    this.advance(task)
    return this.snapshot(task)
  }

  /** 按 poll 次数推进状态；已到终态则保持不变（重复 poll 幂等）。 */
  private advance(task: MockTaskRecord): void {
    if (task.status === 'succeeded' || task.status === 'failed') return

    task.polls += 1
    if (task.polls <= this.pendingPolls) {
      task.status = 'pending'
      return
    }
    if (task.polls <= this.pendingPolls + this.runningPolls) {
      task.status = 'running'
      return
    }

    task.finishedAt = new Date().toISOString()
    if (this.random() < this.failureRate) {
      task.status = 'failed'
      task.error = defaultErrorMessage(task.kind)
    } else {
      task.status = 'succeeded'
      task.result = [this.buildAsset(task)]
    }
  }

  private buildAsset(task: MockTaskRecord): GeneratedAsset {
    const isVideo = VIDEO_KINDS.includes(task.kind)
    return {
      url: this.placeholderUrl(task.id, task.kind),
      kind: isVideo ? 'video' : 'image',
      width: isVideo ? 1024 : 1024,
      height: isVideo ? 576 : 1024,
    }
  }

  /** poll 返回快照而不是内部记录，防止调用方改到 mock 的状态。 */
  private snapshot(task: MockTaskRecord): GenerationTask {
    return {
      id: task.id,
      kind: task.kind,
      status: task.status,
      params: task.params,
      result: task.result,
      error: task.error,
      createdAt: task.createdAt,
      finishedAt: task.finishedAt,
    }
  }

  private delay(): Promise<void> {
    if (this.delayMs <= 0) return Promise.resolve()
    return new Promise((resolve) => setTimeout(resolve, this.delayMs))
  }
}
