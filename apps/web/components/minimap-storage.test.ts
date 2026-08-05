import { describe, expect, it, vi } from 'vitest'
import {
  MINIMAP_VISIBILITY_STORAGE_KEY,
  readStoredMinimapVisibility,
  writeStoredMinimapVisibility,
} from './minimap-storage'

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

describe('minimap visibility storage', () => {
  it('无记录时默认开启', () => {
    expect(readStoredMinimapVisibility(memoryStorage())).toBe(true)
  })

  it.each([true, false])('存取开关：%s', (visible) => {
    const storage = memoryStorage()

    writeStoredMinimapVisibility(visible, storage)

    expect(readStoredMinimapVisibility(storage)).toBe(visible)
    expect(storage.getItem(MINIMAP_VISIBILITY_STORAGE_KEY)).toBe(String(visible))
  })

  it('非法记录会被清除并回退开启', () => {
    const storage = memoryStorage()
    storage.setItem(MINIMAP_VISIBILITY_STORAGE_KEY, 'sometimes')

    expect(readStoredMinimapVisibility(storage)).toBe(true)
    expect(storage.getItem(MINIMAP_VISIBILITY_STORAGE_KEY)).toBeNull()
  })

  it('localStorage 不可用时不阻断读取与写入', () => {
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

    expect(readStoredMinimapVisibility(storage)).toBe(true)
    expect(() => writeStoredMinimapVisibility(false, storage)).not.toThrow()
  })
})
