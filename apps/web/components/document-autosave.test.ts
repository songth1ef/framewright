import { describe, expect, it, vi } from 'vitest'
import { createDocumentAutosave } from './document-autosave'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('document autosave', () => {
  it('保存耗时超过防抖窗口时仍只有一个请求在飞', async () => {
    vi.useFakeTimers()
    const requests = [deferred<void>(), deferred<void>()]
    let active = 0
    let maxActive = 0
    const save = vi.fn(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await requests[save.mock.calls.length - 1]!.promise
      active -= 1
    })
    const autosave = createDocumentAutosave({ save, debounceMs: 800 })

    autosave.queue('v1')
    await vi.advanceTimersByTimeAsync(800)
    autosave.queue('v2')
    await vi.advanceTimersByTimeAsync(800)

    expect(save).toHaveBeenCalledTimes(1)
    expect(maxActive).toBe(1)

    requests[0]!.resolve()
    await flushPromises()
    // 首次请求实测耗时 800ms；完成后的下一次启动至少再间隔 800ms。
    await vi.advanceTimersByTimeAsync(799)
    expect(save).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(2)
    expect(maxActive).toBe(1)
    requests[1]!.resolve()
    await flushPromises()
    autosave.dispose()
    vi.useRealTimers()
  })

  it('保存期间多次变更只 trailing 保存最后一份快照', async () => {
    vi.useFakeTimers()
    const first = deferred<void>()
    const save = vi.fn((snapshot: string) =>
      snapshot === 'v1' ? first.promise : Promise.resolve(),
    )
    const autosave = createDocumentAutosave({ save, debounceMs: 800 })

    autosave.queue('v1')
    await vi.advanceTimersByTimeAsync(800)
    autosave.queue('v2')
    autosave.queue('v3')
    first.resolve()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(800)

    expect(save.mock.calls.map(([snapshot]) => snapshot)).toEqual(['v1', 'v3'])
    autosave.dispose()
    vi.useRealTimers()
  })

  it('失败后按退避时间重试，不会立刻打满', async () => {
    vi.useFakeTimers()
    const save = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined)
    const statuses: string[] = []
    const autosave = createDocumentAutosave({
      save,
      debounceMs: 800,
      retryBaseMs: 1_000,
      onStatus: (status) => statuses.push(status),
    })

    autosave.queue('v1')
    await vi.advanceTimersByTimeAsync(800)
    await flushPromises()
    expect(save).toHaveBeenCalledTimes(1)
    expect(statuses.at(-1)).toBe('error')

    await vi.advanceTimersByTimeAsync(999)
    expect(save).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(2)

    autosave.dispose()
    vi.useRealTimers()
  })

  it('卸载 flush 会绕过防抖、在途与失败退避立即发送最新快照', async () => {
    vi.useFakeTimers()
    const inFlight = deferred<void>()
    const save = vi.fn(() => inFlight.promise)
    const flush = vi.fn(() => Promise.resolve())
    const autosave = createDocumentAutosave({ save, flush, debounceMs: 800 })

    autosave.queue('v1')
    await vi.advanceTimersByTimeAsync(800)
    autosave.queue('v2')
    autosave.flushNow('v2')

    expect(save).toHaveBeenCalledTimes(1)
    expect(flush).toHaveBeenCalledTimes(1)
    expect(flush).toHaveBeenCalledWith('v2')

    inFlight.resolve()
    await flushPromises()
    autosave.dispose()
    vi.useRealTimers()
  })
})
