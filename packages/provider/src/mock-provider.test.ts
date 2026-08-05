import { describe, expect, it } from 'vitest'
import { MockGenerationProvider } from './mock-provider'
import { ProviderError, type GenerationParams } from './types'

const baseParams: GenerationParams = {
  kind: 'text-to-image',
  prompt: '一座被云雾环绕的山峰，电影感',
  options: { size: '1024x1024' },
}

/** 默认节奏：poll 第 1 次 pending、第 2 次 running、第 3 次进终态。 */
function createFastProvider(overrides?: ConstructorParameters<typeof MockGenerationProvider>[0]) {
  return new MockGenerationProvider({ delayMs: 0, ...overrides })
}

describe('provider MockGenerationProvider', () => {
  it('正常成功链路：submit → pending → running → succeeded，返回占位素材 URL，params 原样留存', async () => {
    const provider = createFastProvider()

    const taskId = await provider.submit(baseParams)
    expect(typeof taskId).toBe('string')
    expect(taskId.length).toBeGreaterThan(0)

    const p1 = await provider.poll(taskId)
    expect(p1.status).toBe('pending')
    expect(p1.result).toBeNull()
    expect(p1.error).toBeNull()

    const p2 = await provider.poll(taskId)
    expect(p2.status).toBe('running')
    expect(p2.result).toBeNull()

    const p3 = await provider.poll(taskId)
    expect(p3.status).toBe('succeeded')
    expect(p3.error).toBeNull()
    expect(p3.finishedAt).not.toBeNull()
    expect(p3.result).toHaveLength(1)
    expect(p3.result?.[0]?.url).toBeTruthy()
    expect(p3.result?.[0]?.kind).toBe('image')

    // 参数原样留存，供前端「查看参数 / 一键复跑」
    expect(p3.params).toEqual(baseParams)
    expect(p3.kind).toBe('text-to-image')
  })

  it('终态后重复 poll 保持终态，不重复抽成败', async () => {
    const provider = createFastProvider()
    const taskId = await provider.submit(baseParams)
    await provider.poll(taskId)
    await provider.poll(taskId)
    const done = await provider.poll(taskId)
    expect(done.status).toBe('succeeded')

    const again = await provider.poll(taskId)
    expect(again.status).toBe('succeeded')
    expect(again.result).toEqual(done.result)
    expect(again.finishedAt).toBe(done.finishedAt)
  })

  it('失败率生效：failureRate=1 时终态必为 failed，带 error 且无 result', async () => {
    const provider = createFastProvider({ failureRate: 1 })
    const taskId = await provider.submit(baseParams)
    await provider.poll(taskId)
    await provider.poll(taskId)
    const done = await provider.poll(taskId)

    expect(done.status).toBe('failed')
    expect(done.error).toBeTruthy()
    expect(done.result).toBeNull()
    expect(done.finishedAt).not.toBeNull()
  })

  it('失败判定走注入的 random：failureRate=0.5 时 0.4 失败、0.6 成功', async () => {
    const failing = createFastProvider({ failureRate: 0.5, random: () => 0.4 })
    const failId = await failing.submit(baseParams)
    await failing.poll(failId)
    await failing.poll(failId)
    expect((await failing.poll(failId)).status).toBe('failed')

    const passing = createFastProvider({ failureRate: 0.5, random: () => 0.6 })
    const okId = await passing.submit(baseParams)
    await passing.poll(okId)
    await passing.poll(okId)
    expect((await passing.poll(okId)).status).toBe('succeeded')
  })

  it('延迟生效：submit 与 poll 都至少耗时 delayMs', async () => {
    const provider = createFastProvider({ delayMs: 60 })

    const t0 = Date.now()
    await provider.submit(baseParams)
    const submitElapsed = Date.now() - t0

    const taskId = await provider.submit(baseParams)
    const t1 = Date.now()
    await provider.poll(taskId)
    const pollElapsed = Date.now() - t1

    // 留 15ms 余量防抖动，验证「确实等了」而不是精确计时
    expect(submitElapsed).toBeGreaterThanOrEqual(45)
    expect(pollElapsed).toBeGreaterThanOrEqual(45)
  })

  it('节奏可配置：pendingPolls / runningPolls 决定状态推进的 poll 次数', async () => {
    const provider = createFastProvider({ pendingPolls: 2, runningPolls: 3 })
    const taskId = await provider.submit(baseParams)

    expect((await provider.poll(taskId)).status).toBe('pending')
    expect((await provider.poll(taskId)).status).toBe('pending')
    expect((await provider.poll(taskId)).status).toBe('running')
    expect((await provider.poll(taskId)).status).toBe('running')
    expect((await provider.poll(taskId)).status).toBe('running')
    expect((await provider.poll(taskId)).status).toBe('succeeded')
  })

  it('poll 未知 taskId：抛 ProviderError，code 为 unknown-task', async () => {
    const provider = createFastProvider()
    await expect(provider.poll('no-such-task')).rejects.toBeInstanceOf(ProviderError)
    await expect(provider.poll('no-such-task')).rejects.toMatchObject({ code: 'unknown-task' })
  })

  it.each(['text-to-video', 'image-to-video'] as const)(
    '%s 任务产出可播放的 WebM 视频，而非占位图',
    async (kind) => {
      const provider = createFastProvider()
      const taskId = await provider.submit({
        kind,
        prompt: '让画面缓慢动起来',
        inputAssetUrls: kind === 'image-to-video' ? ['https://example.com/ref.png'] : undefined,
      })
      await provider.poll(taskId)
      await provider.poll(taskId)
      const done = await provider.poll(taskId)

      expect(done.status).toBe('succeeded')
      expect(done.result?.[0]?.kind).toBe('video')
      const url = done.result?.[0]?.url
      expect(url).toMatch(/^data:video\/webm;base64,/)

      const encoded = url?.split(',')[1]
      expect(encoded).toBeTruthy()
      const header = Uint8Array.from(atob(encoded ?? ''), (char) => char.charCodeAt(0)).slice(0, 4)
      expect([...header]).toEqual([0x1a, 0x45, 0xdf, 0xa3])
    },
  )
})
