export const MINIMAP_VISIBILITY_STORAGE_KEY = 'framewright:minimap-visible'

function browserStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

export function readStoredMinimapVisibility(storage = browserStorage()): boolean {
  let stored: string | null
  try {
    stored = storage?.getItem(MINIMAP_VISIBILITY_STORAGE_KEY) ?? null
  } catch {
    return true
  }
  if (stored === null || stored === 'true') return true
  if (stored === 'false') return false

  try {
    storage?.removeItem(MINIMAP_VISIBILITY_STORAGE_KEY)
  } catch {
    // localStorage 是可选能力；清理坏记录失败不应阻断画布打开。
  }
  return true
}

export function writeStoredMinimapVisibility(
  visible: boolean,
  storage = browserStorage(),
): void {
  try {
    storage?.setItem(MINIMAP_VISIBILITY_STORAGE_KEY, String(visible))
  } catch {
    // 隐私模式或存储配额错误不应影响 minimap 开关。
  }
}
