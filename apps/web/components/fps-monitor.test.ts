import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  FPS_DISPLAY_INTERVAL_MS,
  createFpsSampler,
  readFpsMonitorPreference,
} from './fps-monitor'

describe('FPS monitor', () => {
  it('显示更新被节流，不会每个动画帧都更新 DOM', () => {
    const onDisplay = vi.fn()
    const sampler = createFpsSampler(onDisplay)

    for (let timestamp = 0; timestamp < FPS_DISPLAY_INTERVAL_MS; timestamp += 16) {
      sampler.recordFrame(timestamp)
    }
    expect(onDisplay).not.toHaveBeenCalled()

    sampler.recordFrame(FPS_DISPLAY_INTERVAL_MS)
    expect(onDisplay).toHaveBeenCalledTimes(1)

    sampler.recordFrame(FPS_DISPLAY_INTERVAL_MS + 16)
    expect(onDisplay).toHaveBeenCalledTimes(1)
  })

  it('保留最近窗口的最低 FPS，并统计长帧', () => {
    const samples: Array<{ fps: number; minimumFps: number; longFrames: number }> = []
    const sampler = createFpsSampler((sample) => samples.push(sample))

    sampler.recordFrame(0)
    for (let timestamp = 16; timestamp <= 320; timestamp += 16) sampler.recordFrame(timestamp)
    sampler.recordFrame(400)
    for (let timestamp = 416; timestamp <= 720; timestamp += 16) sampler.recordFrame(timestamp)

    expect(samples).toHaveLength(2)
    expect(samples[1]!.minimumFps).toBeLessThanOrEqual(samples[0]!.fps)
    expect(samples[1]!.longFrames).toBe(1)
  })

  it('只有明确保存为开启时才默认开启', () => {
    expect(readFpsMonitorPreference(null)).toBe(false)
    expect(readFpsMonitorPreference({ getItem: () => null })).toBe(false)
    expect(readFpsMonitorPreference({ getItem: () => 'true' })).toBe(true)
  })

  it('默认关闭、记住开关，并固定在底部居中避开工具栏与两侧调试入口', () => {
    const source = readFileSync(new URL('./fps-monitor-view.tsx', import.meta.url), 'utf8')

    expect(source).toContain('useState(false)')
    expect(source).toContain('window.localStorage.setItem')
    expect(source).toContain("bottom: 12")
    expect(source).toContain("left: '50%'")
    expect(source).toContain("transform: 'translateX(-50%)'")
    expect(source).not.toContain("right: 12")
  })
})
