/**
 * 统一设置中心的存储层。
 *
 * 🔴 为什么要收编：设置此前散在 6 个独立的 localStorage 键里，各自有各自的读写、
 * 校验与默认值。后果不是「不好看」，而是三条实际问题：
 *   1. 没有任何地方能回答「这台机器现在的完整配置是什么」——排查性能问题时
 *      要翻六个模块才能拼出全貌；
 *   2. 互相打架的组合无人拦截（裁剪预算调到 6000，但 LOD 阈值还是默认的早早降级）；
 *   3. 用户找不到入口，只能在工具栏和面板里到处摸。
 *
 * ⚠️ 迁移必须无损：老用户的键里存着他们调过的值，直接换新键等于把设置清零。
 * 这里读到旧键时**先并入再删**，并且只在新键不存在时才迁移 —— 否则每次启动都会
 * 用旧值覆盖新值。
 */
import {
  DEFAULT_PERFORMANCE_PRESET,
  PERFORMANCE_PRESETS,
  isPerformanceProfile,
  type PerformanceProfile,
} from '@framewright/core'

export const SETTINGS_STORAGE_KEY = 'framewright:settings'

/** 收编前的独立键。迁移后删除，留在这里是为了让人看得见「收编了哪些」。 */
export const LEGACY_STORAGE_KEYS = {
  cullingLimits: 'framewright:viewport-culling-limits',
  fpsMonitor: 'framewright:fps-monitor-enabled',
  minimapVisible: 'framewright:minimap-visible',
  interactionMode: 'framewright:interaction-mode',
  connectionVisibility: 'framewright:connection-visibility',
} as const

export type InteractionMode = 'unified' | 'native'
export type ConnectionVisibility = 'visible' | 'hidden'
export type RendererId = 'dom' | 'leafer'

export interface AppSettings {
  /** 性能画质档案。裁剪预算、缩放范围、LOD 阈值都在这里。 */
  performance: PerformanceProfile
  /** 当前选中的预设名；自定义时为 'custom'。仅用于 UI 回显，真相是 performance。 */
  performancePreset: string
  renderer: RendererId
  interactionMode: InteractionMode
  connectionVisibility: ConnectionVisibility
  minimapVisible: boolean
  fpsMonitorVisible: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  performance: PERFORMANCE_PRESETS[DEFAULT_PERFORMANCE_PRESET],
  performancePreset: DEFAULT_PERFORMANCE_PRESET,
  renderer: 'dom',
  interactionMode: 'unified',
  connectionVisibility: 'visible',
  minimapVisible: true,
  fpsMonitorVisible: false,
}

function storage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

function readJson(store: Storage, key: string): unknown {
  try {
    const raw = store.getItem(key)
    return raw === null ? undefined : JSON.parse(raw)
  } catch {
    return undefined
  }
}

/**
 * 逐字段校验。**坏字段回退到默认值，而不是整份配置作废** ——
 * 一个字段写坏就把用户其余设置全清掉，是比原问题更糟的后果。
 */
export function normalizeSettings(value: unknown): AppSettings {
  const candidate = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const performance = isPerformanceProfile(candidate['performance'])
    ? candidate['performance']
    : DEFAULT_SETTINGS.performance
  const oneOf = <T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T =>
    typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback

  return {
    performance,
    performancePreset: typeof candidate['performancePreset'] === 'string'
      ? candidate['performancePreset']
      : DEFAULT_SETTINGS.performancePreset,
    renderer: oneOf(candidate['renderer'], ['dom', 'leafer'] as const, DEFAULT_SETTINGS.renderer),
    interactionMode: oneOf(
      candidate['interactionMode'], ['unified', 'native'] as const, DEFAULT_SETTINGS.interactionMode),
    connectionVisibility: oneOf(
      candidate['connectionVisibility'], ['visible', 'hidden'] as const,
      DEFAULT_SETTINGS.connectionVisibility),
    minimapVisible: typeof candidate['minimapVisible'] === 'boolean'
      ? candidate['minimapVisible'] : DEFAULT_SETTINGS.minimapVisible,
    fpsMonitorVisible: typeof candidate['fpsMonitorVisible'] === 'boolean'
      ? candidate['fpsMonitorVisible'] : DEFAULT_SETTINGS.fpsMonitorVisible,
  }
}

/**
 * 把 6 个旧键并进统一设置。只在统一键尚不存在时执行 ——
 * 否则每次启动都会用旧值盖掉用户刚在设置页改的新值。
 */
export function migrateLegacySettings(store: Storage): AppSettings | undefined {
  if (store.getItem(SETTINGS_STORAGE_KEY) !== null) return undefined

  const legacyCulling = readJson(store, LEGACY_STORAGE_KEYS.cullingLimits)
  const merged: AppSettings = { ...DEFAULT_SETTINGS }
  let touched = false

  if (typeof legacyCulling === 'object' && legacyCulling !== null) {
    const limits = legacyCulling as { maxNodes?: unknown; maxConnections?: unknown }
    const next = { ...merged.performance }
    if (Number.isSafeInteger(limits.maxNodes)) next.maxNodes = limits.maxNodes as number
    if (Number.isSafeInteger(limits.maxConnections)) next.maxConnections = limits.maxConnections as number
    if (isPerformanceProfile(next)) {
      merged.performance = next
      merged.performancePreset = 'custom'
      touched = true
    }
  }

  const rawMode = store.getItem(LEGACY_STORAGE_KEYS.interactionMode)
  if (rawMode === 'unified' || rawMode === 'native') { merged.interactionMode = rawMode; touched = true }

  const rawVisibility = store.getItem(LEGACY_STORAGE_KEYS.connectionVisibility)
  if (rawVisibility === 'visible' || rawVisibility === 'hidden') {
    merged.connectionVisibility = rawVisibility
    touched = true
  }

  const rawMinimap = store.getItem(LEGACY_STORAGE_KEYS.minimapVisible)
  if (rawMinimap !== null) { merged.minimapVisible = rawMinimap !== 'false'; touched = true }

  const rawFps = store.getItem(LEGACY_STORAGE_KEYS.fpsMonitor)
  if (rawFps !== null) { merged.fpsMonitorVisible = rawFps === 'true'; touched = true }

  if (!touched) return undefined
  store.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged))
  for (const key of Object.values(LEGACY_STORAGE_KEYS)) store.removeItem(key)
  return merged
}

export function loadSettings(): AppSettings {
  const store = storage()
  if (store === undefined) return DEFAULT_SETTINGS
  const migrated = migrateLegacySettings(store)
  if (migrated !== undefined) return migrated

  const raw = readJson(store, SETTINGS_STORAGE_KEY)
  const normalized = normalizeSettings(raw)
  // 自愈：读到坏配置时把规范化结果写回去，保证存储里**永远**是一份合法配置。
  // 不写回的话坏数据会一直躺着：UI 每次都靠规范化兜住，看起来正常，
  // 而真正的问题（谁写坏的、什么时候写坏的）永远不显形。
  if (raw !== undefined && JSON.stringify(raw) !== JSON.stringify(normalized)) {
    saveSettings(normalized)
  }
  return normalized
}

export function saveSettings(settings: AppSettings): void {
  try {
    storage()?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // 存不下（隐私模式 / 配额满）不该让设置页崩掉；本次会话内的值仍然生效。
  }
}

export function resetSettings(): AppSettings {
  try {
    storage()?.removeItem(SETTINGS_STORAGE_KEY)
  } catch { /* 同上 */ }
  return DEFAULT_SETTINGS
}
