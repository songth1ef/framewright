export type DocumentSaveStatus = 'saving' | 'saved' | 'error'

interface DocumentAutosaveOptions<T> {
  save: (snapshot: T) => Promise<void>
  flush?: (snapshot: T) => Promise<void>
  debounceMs?: number
  retryBaseMs?: number
  retryMaxMs?: number
  onStatus?: (status: DocumentSaveStatus) => void
  onSaved?: (snapshot: T) => void
  onError?: (error: unknown) => void
  now?: () => number
}

export interface DocumentAutosave<T> {
  queue(snapshot: T): void
  flushNow(snapshot: T): void
  dispose(): void
}

interface PendingSnapshot<T> {
  revision: number
  value: T
}

const DEFAULT_DEBOUNCE_MS = 800
const DEFAULT_RETRY_BASE_MS = 1_000
const DEFAULT_RETRY_MAX_MS = 30_000

/**
 * 自动保存的调度层：普通保存 single-flight，期间只保留最新快照；卸载 flush 独立直发。
 */
export function createDocumentAutosave<T>(options: DocumentAutosaveOptions<T>): DocumentAutosave<T> {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS
  const retryMaxMs = options.retryMaxMs ?? DEFAULT_RETRY_MAX_MS
  const now = options.now ?? Date.now
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: PendingSnapshot<T> | null = null
  let revision = 0
  let inFlight = false
  let disposed = false
  let nextAllowedAt = 0
  let retryNotBefore = 0
  let consecutiveFailures = 0

  const clearTimer = (): void => {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }

  const scheduleAt = (dueAt: number): void => {
    if (disposed || inFlight || pending === null) return
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      void startSave()
    }, Math.max(0, dueAt - now()))
  }

  const scheduleTrailing = (): void => {
    scheduleAt(Math.max(nextAllowedAt, retryNotBefore))
  }

  const startSave = async (): Promise<void> => {
    if (disposed || inFlight || pending === null) return
    const candidate = pending
    const startedAt = now()
    inFlight = true
    options.onStatus?.('saving')
    try {
      await options.save(candidate.value)
      const completedAt = now()
      const duration = Math.max(0, completedAt - startedAt)
      nextAllowedAt = completedAt + duration
      consecutiveFailures = 0
      retryNotBefore = 0
      if (pending?.revision === candidate.revision) {
        pending = null
        options.onSaved?.(candidate.value)
        options.onStatus?.('saved')
      }
    } catch (error: unknown) {
      const completedAt = now()
      const duration = Math.max(0, completedAt - startedAt)
      nextAllowedAt = completedAt + duration
      consecutiveFailures += 1
      const retryDelay = Math.min(
        retryMaxMs,
        retryBaseMs * 2 ** (consecutiveFailures - 1),
      )
      retryNotBefore = completedAt + retryDelay
      options.onError?.(error)
      options.onStatus?.('error')
    } finally {
      inFlight = false
      scheduleTrailing()
    }
  }

  return {
    queue(snapshot) {
      if (disposed) return
      revision += 1
      pending = { revision, value: snapshot }
      options.onStatus?.('saving')
      if (inFlight) return
      scheduleAt(Math.max(now() + debounceMs, nextAllowedAt, retryNotBefore))
    },
    flushNow(snapshot) {
      if (disposed) return
      clearTimer()
      pending = null
      const flush = options.flush ?? options.save
      void flush(snapshot).catch((error: unknown) => options.onError?.(error))
    },
    dispose() {
      disposed = true
      clearTimer()
      pending = null
    },
  }
}
