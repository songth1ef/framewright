import {
  DEFAULT_CONNECTION_VISIBILITY,
  type ConnectionVisibility,
} from '@framewright/core'

export { DEFAULT_CONNECTION_VISIBILITY }
export const CONNECTION_VISIBILITY_STORAGE_KEY = 'framewright:connection-visibility'

function browserStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

function isConnectionVisibility(value: unknown): value is ConnectionVisibility {
  return value === 'visible' || value === 'hidden'
}

export function readStoredConnectionVisibility(
  storage = browserStorage(),
): ConnectionVisibility {
  let stored: string | null
  try {
    stored = storage?.getItem(CONNECTION_VISIBILITY_STORAGE_KEY) ?? null
  } catch {
    return DEFAULT_CONNECTION_VISIBILITY
  }
  if (stored === null) return DEFAULT_CONNECTION_VISIBILITY
  if (isConnectionVisibility(stored)) return stored

  try {
    storage?.removeItem(CONNECTION_VISIBILITY_STORAGE_KEY)
  } catch {
    // localStorage 可能被浏览器策略禁用；坏记录清理失败不应阻断画布打开。
  }
  return DEFAULT_CONNECTION_VISIBILITY
}

export function writeStoredConnectionVisibility(
  connectionVisibility: ConnectionVisibility,
  storage = browserStorage(),
): void {
  try {
    storage?.setItem(CONNECTION_VISIBILITY_STORAGE_KEY, connectionVisibility)
  } catch {
    // localStorage 是可选的浏览器能力；配额或策略错误不能打断视图切换。
  }
}
