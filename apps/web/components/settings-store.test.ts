import { beforeEach, describe, expect, it } from 'vitest'
import { PERFORMANCE_PRESETS } from '@framewright/core'
import {
  DEFAULT_SETTINGS,
  LEGACY_STORAGE_KEYS,
  SETTINGS_STORAGE_KEY,
  migrateLegacySettings,
  normalizeSettings,
} from './settings-store'

/** 最小内存版 Storage，避免依赖 jsdom 的实现细节。 */
function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed))
  return {
    get length() { return map.size },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => { map.delete(key) },
    setItem: (key: string, value: string) => { map.set(key, value) },
  }
}

describe('统一设置存储', () => {
  let store: Storage
  beforeEach(() => { store = memoryStorage() })

  describe('校验', () => {
    it('空值给出全套默认设置', () => {
      expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    })

    // 🔴 一个字段写坏就把用户其余设置全清掉,是比原问题更糟的后果。
    it('坏字段只回退该字段,不作废整份配置', () => {
      const result = normalizeSettings({
        renderer: 'leafer',
        interactionMode: '乱七八糟',
        minimapVisible: 'yes',
        performance: { maxNodes: -1 },
      })
      expect(result.renderer).toBe('leafer')
      expect(result.interactionMode).toBe(DEFAULT_SETTINGS.interactionMode)
      expect(result.minimapVisible).toBe(DEFAULT_SETTINGS.minimapVisible)
      expect(result.performance).toEqual(DEFAULT_SETTINGS.performance)
    })
  })

  describe('旧键迁移', () => {
    it('把分散的旧键并进统一设置并删除旧键', () => {
      store = memoryStorage({
        [LEGACY_STORAGE_KEYS.cullingLimits]: JSON.stringify({ maxNodes: 3000, maxConnections: 500 }),
        [LEGACY_STORAGE_KEYS.interactionMode]: 'native',
        [LEGACY_STORAGE_KEYS.connectionVisibility]: 'hidden',
        [LEGACY_STORAGE_KEYS.minimapVisible]: 'false',
        [LEGACY_STORAGE_KEYS.fpsMonitor]: 'true',
      })
      const migrated = migrateLegacySettings(store)

      expect(migrated?.performance.maxNodes).toBe(3000)
      expect(migrated?.performance.maxConnections).toBe(500)
      expect(migrated?.interactionMode).toBe('native')
      expect(migrated?.connectionVisibility).toBe('hidden')
      expect(migrated?.minimapVisible).toBe(false)
      expect(migrated?.fpsMonitorVisible).toBe(true)
      // 调过的预算不属于任何预设,应标记为自定义
      expect(migrated?.performancePreset).toBe('custom')

      for (const key of Object.values(LEGACY_STORAGE_KEYS)) {
        expect(store.getItem(key)).toBeNull()
      }
      expect(store.getItem(SETTINGS_STORAGE_KEY)).not.toBeNull()
    })

    // 🔴 若不加这个判断,每次启动都会用旧值盖掉用户刚在设置页改的新值。
    it('统一键已存在时不迁移,避免旧值覆盖新值', () => {
      store = memoryStorage({
        [SETTINGS_STORAGE_KEY]: JSON.stringify({ ...DEFAULT_SETTINGS, renderer: 'leafer' }),
        [LEGACY_STORAGE_KEYS.interactionMode]: 'native',
      })
      expect(migrateLegacySettings(store)).toBeUndefined()
      expect(store.getItem(LEGACY_STORAGE_KEYS.interactionMode)).toBe('native')
    })

    it('没有任何旧键时不写入,保持全新用户的干净状态', () => {
      expect(migrateLegacySettings(store)).toBeUndefined()
      expect(store.getItem(SETTINGS_STORAGE_KEY)).toBeNull()
    })

    // 旧键里的值可能超出档案约束（旧的上限是 100_000，档案更严）。
    // 此时**不写入**而不是强行落一份默认值：没有可迁移的合法内容，
    // 加载器自然回落默认即可；写一份进去反而让人以为迁移成功了。
    it('旧裁剪预算非法时不产生非法组合,也不写入', () => {
      store = memoryStorage({
        [LEGACY_STORAGE_KEYS.cullingLimits]: JSON.stringify({ maxNodes: 999_999_999 }),
      })
      expect(migrateLegacySettings(store)).toBeUndefined()
      expect(store.getItem(SETTINGS_STORAGE_KEY)).toBeNull()
    })

    it('旧裁剪预算合法但只有一项时,另一项保持默认', () => {
      store = memoryStorage({
        [LEGACY_STORAGE_KEYS.cullingLimits]: JSON.stringify({ maxNodes: 2500 }),
      })
      const migrated = migrateLegacySettings(store)
      expect(migrated?.performance.maxNodes).toBe(2500)
      expect(migrated?.performance.maxConnections)
        .toBe(PERFORMANCE_PRESETS.balanced.maxConnections)
    })
  })
})
