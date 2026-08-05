import { DEFAULT_INTERACTION_MODE, type InteractionMode } from '@framewright/core'

export { DEFAULT_INTERACTION_MODE }
export const INTERACTION_MODE_STORAGE_KEY = 'framewright:interaction-mode'

function browserStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

function isInteractionMode(value: unknown): value is InteractionMode {
  return value === 'unified' || value === 'native'
}

export function readStoredInteractionMode(storage = browserStorage()): InteractionMode {
  let stored: string | null
  try {
    stored = storage?.getItem(INTERACTION_MODE_STORAGE_KEY) ?? null
  } catch {
    return DEFAULT_INTERACTION_MODE
  }
  if (stored === null) return DEFAULT_INTERACTION_MODE
  if (isInteractionMode(stored)) return stored

  try {
    storage?.removeItem(INTERACTION_MODE_STORAGE_KEY)
  } catch {
    // localStorage 可能被浏览器策略禁用；坏记录清理失败不应阻断画布打开。
  }
  return DEFAULT_INTERACTION_MODE
}

export function writeStoredInteractionMode(
  interactionMode: InteractionMode,
  storage = browserStorage(),
): void {
  try {
    storage?.setItem(INTERACTION_MODE_STORAGE_KEY, interactionMode)
  } catch {
    // localStorage 是可选的浏览器能力；配额或策略错误不能打断模式切换。
  }
}
