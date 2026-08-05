import {
  DEFAULT_VIEWPORT_CULLING_LIMITS,
  type ViewportCullingLimits,
} from '@framewright/core'

export type { ViewportCullingLimits } from '@framewright/core'
export { DEFAULT_VIEWPORT_CULLING_LIMITS } from '@framewright/core'

export const VIEWPORT_CULLING_STORAGE_KEY = 'framewright:viewport-culling-limits'
export const MIN_CONFIGURABLE_NODES = 1
export const MAX_CONFIGURABLE_NODES = 100_000
export const MIN_CONFIGURABLE_CONNECTIONS = 0
export const MAX_CONFIGURABLE_CONNECTIONS = 100_000
function browserStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

export function isViewportCullingLimits(value: unknown): value is ViewportCullingLimits {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<ViewportCullingLimits>
  return (
    Number.isSafeInteger(candidate.maxNodes) &&
    candidate.maxNodes !== undefined &&
    candidate.maxNodes >= MIN_CONFIGURABLE_NODES &&
    candidate.maxNodes <= MAX_CONFIGURABLE_NODES &&
    Number.isSafeInteger(candidate.maxConnections) &&
    candidate.maxConnections !== undefined &&
    candidate.maxConnections >= MIN_CONFIGURABLE_CONNECTIONS &&
    candidate.maxConnections <= MAX_CONFIGURABLE_CONNECTIONS
  )
}

function clearStoredViewportCullingLimits(storage: Storage | undefined): void {
  try {
    storage?.removeItem(VIEWPORT_CULLING_STORAGE_KEY)
  } catch {
    // localStorage 是可选能力；清理坏记录失败不应阻断画布打开。
  }
}

export function readStoredViewportCullingLimits(
  storage = browserStorage(),
): ViewportCullingLimits {
  let stored: string | null
  try {
    stored = storage?.getItem(VIEWPORT_CULLING_STORAGE_KEY) ?? null
  } catch {
    return DEFAULT_VIEWPORT_CULLING_LIMITS
  }
  if (stored === null) return DEFAULT_VIEWPORT_CULLING_LIMITS

  try {
    const parsed: unknown = JSON.parse(stored)
    if (isViewportCullingLimits(parsed)) return parsed
  } catch {
    // 统一在下方清理坏记录并回退。
  }
  clearStoredViewportCullingLimits(storage)
  return DEFAULT_VIEWPORT_CULLING_LIMITS
}

export function writeStoredViewportCullingLimits(
  limits: ViewportCullingLimits,
  storage = browserStorage(),
): void {
  if (!isViewportCullingLimits(limits)) return
  try {
    storage?.setItem(VIEWPORT_CULLING_STORAGE_KEY, JSON.stringify(limits))
  } catch {
    // 隐私模式或存储配额错误不应影响裁剪预算的本次使用。
  }
}
