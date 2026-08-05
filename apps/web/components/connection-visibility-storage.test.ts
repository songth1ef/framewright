import type { ConnectionVisibility } from '@framewright/core'
import { describe, expect, it, vi } from 'vitest'
import {
  CONNECTION_VISIBILITY_STORAGE_KEY,
  DEFAULT_CONNECTION_VISIBILITY,
  readStoredConnectionVisibility,
  writeStoredConnectionVisibility,
} from './connection-visibility-storage'

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

describe('connection visibility storage', () => {
  it('无记录时默认显示连线', () => {
    expect(readStoredConnectionVisibility(memoryStorage())).toBe(DEFAULT_CONNECTION_VISIBILITY)
    expect(DEFAULT_CONNECTION_VISIBILITY).toBe('visible')
  })

  it.each<ConnectionVisibility>(['visible', 'hidden'])('持久化往返：%s', (visibility) => {
    const storage = memoryStorage()

    writeStoredConnectionVisibility(visibility, storage)

    expect(readStoredConnectionVisibility(storage)).toBe(visibility)
    expect(storage.getItem(CONNECTION_VISIBILITY_STORAGE_KEY)).toBe(visibility)
  })

  it('非法记录会被清除并回退默认显示', () => {
    const storage = memoryStorage()
    storage.setItem(CONNECTION_VISIBILITY_STORAGE_KEY, 'sometimes')

    expect(readStoredConnectionVisibility(storage)).toBe('visible')
    expect(storage.getItem(CONNECTION_VISIBILITY_STORAGE_KEY)).toBeNull()
  })

  it('localStorage 不可用时不阻断读取与写入', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('blocked')
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked')
      }),
    } as unknown as Storage

    expect(readStoredConnectionVisibility(storage)).toBe('visible')
    expect(() => writeStoredConnectionVisibility('hidden', storage)).not.toThrow()
  })
})
