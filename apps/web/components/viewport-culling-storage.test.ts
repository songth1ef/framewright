import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_VIEWPORT_CULLING_LIMITS,
  MAX_CONFIGURABLE_CONNECTIONS,
  MAX_CONFIGURABLE_NODES,
  MIN_CONFIGURABLE_CONNECTIONS,
  MIN_CONFIGURABLE_NODES,
  VIEWPORT_CULLING_STORAGE_KEY,
  readStoredViewportCullingLimits,
  writeStoredViewportCullingLimits,
} from './viewport-culling-storage'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key)
    },
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
}

describe('视口裁剪预算 storage', () => {
  it('无记录时回退 core 的契约默认值', () => {
    expect(readStoredViewportCullingLimits(memoryStorage())).toEqual(
      DEFAULT_VIEWPORT_CULLING_LIMITS,
    )
  })

  it.each([
    {
      maxNodes: MIN_CONFIGURABLE_NODES,
      maxConnections: MIN_CONFIGURABLE_CONNECTIONS,
    },
    {
      maxNodes: MAX_CONFIGURABLE_NODES,
      maxConnections: MAX_CONFIGURABLE_CONNECTIONS,
    },
  ])('上下边界值可持久化：%o', (limits) => {
    const storage = memoryStorage()

    writeStoredViewportCullingLimits(limits, storage)

    expect(readStoredViewportCullingLimits(storage)).toEqual(limits)
  })

  it.each([
    { maxNodes: 0, maxConnections: 1 },
    { maxNodes: MAX_CONFIGURABLE_NODES + 1, maxConnections: 1 },
    { maxNodes: 1.5, maxConnections: 1 },
    { maxNodes: 1, maxConnections: -1 },
    { maxNodes: 1, maxConnections: MAX_CONFIGURABLE_CONNECTIONS + 1 },
    { maxNodes: 1, maxConnections: 1.5 },
  ])('越界或非整数记录会清除并回退：%o', (limits) => {
    const storage = memoryStorage()
    storage.setItem(VIEWPORT_CULLING_STORAGE_KEY, JSON.stringify(limits))

    expect(readStoredViewportCullingLimits(storage)).toEqual(DEFAULT_VIEWPORT_CULLING_LIMITS)
    expect(storage.getItem(VIEWPORT_CULLING_STORAGE_KEY)).toBeNull()
  })

  it('非法 JSON 会清除并回退', () => {
    const storage = memoryStorage()
    storage.setItem(VIEWPORT_CULLING_STORAGE_KEY, '{')

    expect(readStoredViewportCullingLimits(storage)).toEqual(DEFAULT_VIEWPORT_CULLING_LIMITS)
    expect(storage.getItem(VIEWPORT_CULLING_STORAGE_KEY)).toBeNull()
  })

  it('写入非法值时不覆盖已有正常配置', () => {
    const storage = memoryStorage()
    writeStoredViewportCullingLimits({ maxNodes: 2_000, maxConnections: 3_000 }, storage)

    writeStoredViewportCullingLimits(
      { maxNodes: 0, maxConnections: 3_000 },
      storage,
    )

    expect(readStoredViewportCullingLimits(storage)).toEqual({
      maxNodes: 2_000,
      maxConnections: 3_000,
    })
  })

  it('localStorage 不可用时不阻断读写', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('blocked')
      }),
      removeItem: vi.fn(() => {
        throw new Error('blocked')
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked')
      }),
    } as unknown as Storage

    expect(readStoredViewportCullingLimits(storage)).toEqual(DEFAULT_VIEWPORT_CULLING_LIMITS)
    expect(() =>
      writeStoredViewportCullingLimits(DEFAULT_VIEWPORT_CULLING_LIMITS, storage),
    ).not.toThrow()
  })
})
