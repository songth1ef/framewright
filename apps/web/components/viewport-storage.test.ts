import { DEFAULT_VIEWPORT, type Viewport } from '@framewright/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  VIEWPORT_STORAGE_WRITE_INTERVAL_MS,
  clearStoredViewport,
  createViewportStorageWriter,
  readStoredViewport,
  viewportStorageKey,
  writeStoredViewport,
} from './viewport-storage'

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

afterEach(() => vi.useRealTimers())

describe('viewport storage', () => {
  it('按 documentId 存取往返，且不同画布互不覆盖', () => {
    const storage = memoryStorage()
    const viewport = { scale: 1.75, offsetX: -320, offsetY: 48 }

    writeStoredViewport('doc/a', viewport, storage)

    expect(readStoredViewport('doc/a', storage)).toEqual(viewport)
    expect(readStoredViewport('doc-b', storage)).toEqual(DEFAULT_VIEWPORT)
    expect(storage.getItem(viewportStorageKey('doc/a'))).toBe(JSON.stringify(viewport))
  })

  it('无记录时使用现有默认视口', () => {
    expect(readStoredViewport('missing', memoryStorage())).toEqual(DEFAULT_VIEWPORT)
  })

  it.each([
    ['损坏 JSON', '{'],
    ['缩放过小', JSON.stringify({ scale: 0.09, offsetX: 0, offsetY: 0 })],
    ['缩放过大', JSON.stringify({ scale: 4.01, offsetX: 0, offsetY: 0 })],
    ['非有限坐标', JSON.stringify({ scale: 1, offsetX: 'Infinity', offsetY: 0 })],
  ])('坏数据回退默认并清除记录：%s', (_label, stored) => {
    const storage = memoryStorage()
    const key = viewportStorageKey('doc-a')
    storage.setItem(key, stored)

    expect(readStoredViewport('doc-a', storage)).toEqual(DEFAULT_VIEWPORT)
    expect(storage.getItem(key)).toBeNull()
  })

  it('300ms 窗口内只写最后一次视口，不随每次调用写 localStorage', () => {
    vi.useFakeTimers()
    const storage = memoryStorage()
    const setItem = vi.spyOn(storage, 'setItem')
    const writer = createViewportStorageWriter('doc-a', storage)
    const viewports: Viewport[] = [
      { scale: 1.1, offsetX: 10, offsetY: 20 },
      { scale: 1.2, offsetX: 30, offsetY: 40 },
      { scale: 1.3, offsetX: 50, offsetY: 60 },
    ]

    viewports.forEach(writer.queue)
    expect(setItem).not.toHaveBeenCalled()

    vi.advanceTimersByTime(VIEWPORT_STORAGE_WRITE_INTERVAL_MS)
    expect(setItem).toHaveBeenCalledOnce()
    expect(readStoredViewport('doc-a', storage)).toEqual(viewports[2])

    writer.dispose()
  })

  it('删除记录只影响指定画布', () => {
    const storage = memoryStorage()
    writeStoredViewport('doc-a', { scale: 2, offsetX: 1, offsetY: 2 }, storage)
    writeStoredViewport('doc-b', { scale: 3, offsetX: 3, offsetY: 4 }, storage)

    clearStoredViewport('doc-a', storage)

    expect(readStoredViewport('doc-a', storage)).toEqual(DEFAULT_VIEWPORT)
    expect(readStoredViewport('doc-b', storage).scale).toBe(3)
  })
})
