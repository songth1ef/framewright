import type { InteractionMode } from '@framewright/core'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_INTERACTION_MODE,
  INTERACTION_MODE_STORAGE_KEY,
  readStoredInteractionMode,
  writeStoredInteractionMode,
} from './interaction-mode-storage'

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

describe('interaction mode storage', () => {
  it('无记录时默认使用 unified', () => {
    expect(readStoredInteractionMode(memoryStorage())).toBe(DEFAULT_INTERACTION_MODE)
    expect(DEFAULT_INTERACTION_MODE).toBe('unified')
  })

  it.each<InteractionMode>(['unified', 'native'])('存取合法模式：%s', (mode) => {
    const storage = memoryStorage()

    writeStoredInteractionMode(mode, storage)

    expect(readStoredInteractionMode(storage)).toBe(mode)
    expect(storage.getItem(INTERACTION_MODE_STORAGE_KEY)).toBe(mode)
  })

  it('非法记录会被清除并回退 unified', () => {
    const storage = memoryStorage()
    storage.setItem(INTERACTION_MODE_STORAGE_KEY, 'fast-but-different')

    expect(readStoredInteractionMode(storage)).toBe('unified')
    expect(storage.getItem(INTERACTION_MODE_STORAGE_KEY)).toBeNull()
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

    expect(readStoredInteractionMode(storage)).toBe('unified')
    expect(() => writeStoredInteractionMode('native', storage)).not.toThrow()
  })
})
