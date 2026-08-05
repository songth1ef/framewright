import { DEFAULT_VIEWPORT, type Viewport } from '@framewright/core'

export const VIEWPORT_STORAGE_WRITE_INTERVAL_MS = 300
const VIEWPORT_STORAGE_PREFIX = 'framewright:viewport:'
const MIN_SCALE = 0.1
const MAX_SCALE = 4

/**
 * Viewport 刻意不进入 Document 的自动保存路径：
 * 1. 频率：平移一次会产生几十上百次变化。在一万节点画布上，滚一下滚轮若触发
 *    Document 自动保存，就会发出一次编排方实测为 4.62 MiB 的全量 PUT。
 * 2. 语义：viewport 是每个用户自己的观看状态，不是文档内容。多人打开同一画布时
 *    应各看各的位置，一个人的滚动不能改变所有人的视图。
 * 将来即使要跨设备同步，它也应是「用户 × 文档」的独立轻量记录，永远不属于
 * Document 本身。当前因此按 documentId 存在 localStorage，并节流同步写入。
 */
export function viewportStorageKey(documentId: string): string {
  return `${VIEWPORT_STORAGE_PREFIX}${encodeURIComponent(documentId)}`
}

function browserStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

function isViewport(value: unknown): value is Viewport {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate['scale'] === 'number'
    && Number.isFinite(candidate['scale'])
    && candidate['scale'] >= MIN_SCALE
    && candidate['scale'] <= MAX_SCALE
    && typeof candidate['offsetX'] === 'number'
    && Number.isFinite(candidate['offsetX'])
    && typeof candidate['offsetY'] === 'number'
    && Number.isFinite(candidate['offsetY'])
}

export function clearStoredViewport(documentId: string, storage = browserStorage()): void {
  try {
    storage?.removeItem(viewportStorageKey(documentId))
  } catch {
    // localStorage 可能被浏览器策略禁用；清理失败不应阻断画布删除或打开。
  }
}

export function readStoredViewport(documentId: string, storage = browserStorage()): Viewport {
  const key = viewportStorageKey(documentId)
  let stored: string | null
  try {
    stored = storage?.getItem(key) ?? null
  } catch {
    return DEFAULT_VIEWPORT
  }
  if (stored === null) return DEFAULT_VIEWPORT

  try {
    const parsed: unknown = JSON.parse(stored)
    if (isViewport(parsed)) return parsed
  } catch {
    // 统一走下方坏记录清理。
  }

  clearStoredViewport(documentId, storage)
  return DEFAULT_VIEWPORT
}

export function writeStoredViewport(
  documentId: string,
  viewport: Viewport,
  storage = browserStorage(),
): void {
  if (!isViewport(viewport)) {
    clearStoredViewport(documentId, storage)
    return
  }
  try {
    storage?.setItem(viewportStorageKey(documentId), JSON.stringify(viewport))
  } catch {
    // localStorage 是可选的浏览器能力；配额或策略错误不能打断画布交互。
  }
}

export interface ViewportStorageWriter {
  queue(viewport: Viewport): void
  flush(): void
  dispose(): void
}

export function createViewportStorageWriter(
  documentId: string,
  storage = browserStorage(),
  intervalMs = VIEWPORT_STORAGE_WRITE_INTERVAL_MS,
): ViewportStorageWriter {
  let pending: Viewport | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    if (pending === null) return
    const viewport = pending
    pending = null
    writeStoredViewport(documentId, viewport, storage)
  }

  return {
    queue(viewport) {
      pending = viewport
      // 不重置已有 timer：连续 pointermove 最多每个窗口写一次，而不是无限后延。
      timer ??= setTimeout(flush, intervalMs)
    },
    flush,
    dispose: flush,
  }
}
