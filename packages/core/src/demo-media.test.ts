import { describe, expect, it } from 'vitest'
import { PUBLIC_AUDIO_ASSETS, PUBLIC_IMAGE_ASSETS, PUBLIC_VIDEO_ASSETS } from './demo-media'

function expectValidHttpsUrl(url: string): void {
  const parsed = new URL(url)
  expect(parsed.protocol).toBe('https:')
  expect(parsed.hostname).not.toBe('commondatastorage.googleapis.com')
}

describe('公开 demo 素材清单', () => {
  it('图片与视频列表非空，URL 和实测元数据格式合法', () => {
    expect(PUBLIC_IMAGE_ASSETS.length).toBeGreaterThan(0)
    expect(PUBLIC_VIDEO_ASSETS.length).toBeGreaterThan(0)

    for (const asset of PUBLIC_IMAGE_ASSETS) {
      expectValidHttpsUrl(asset.url)
      expect(asset.id).toMatch(/^[a-z0-9-]+$/)
      expect(asset.width).toBeGreaterThan(0)
      expect(asset.height).toBeGreaterThan(0)
    }
    for (const asset of PUBLIC_VIDEO_ASSETS) {
      expectValidHttpsUrl(asset.url)
      expect(asset.id).toMatch(/^[a-z0-9-]+$/)
      expect(asset.width).toBeGreaterThan(0)
      expect(asset.height).toBeGreaterThan(0)
      expect(asset.durationSeconds).toBeGreaterThanOrEqual(5)
      expect(asset.durationSeconds).toBeLessThan(62)
    }
  })

  it('图片至少覆盖八种宽高比和 720p、1K、2K、4K、8K 五档分辨率', () => {
    expect(new Set(PUBLIC_IMAGE_ASSETS.map((asset) => asset.aspectRatio)).size).toBeGreaterThanOrEqual(8)
    expect(new Set(PUBLIC_IMAGE_ASSETS.map((asset) => asset.resolutionTier))).toEqual(
      new Set(['720p', '1K', '2K', '4K', '8K']),
    )
  })

  it('视频时长覆盖约 5 秒、10 秒、30 秒和 1 分钟', () => {
    const durations = PUBLIC_VIDEO_ASSETS.map((asset) => asset.durationSeconds)

    expect(durations.some((duration) => duration >= 5 && duration < 8)).toBe(true)
    expect(durations.some((duration) => duration >= 9 && duration < 15)).toBe(true)
    expect(durations.some((duration) => duration >= 30 && duration < 40)).toBe(true)
    expect(durations.some((duration) => duration >= 55 && duration < 62)).toBe(true)
  })

  it('音频列表非空，URL、时长、采样率与声道数格式合法', () => {
    expect(PUBLIC_AUDIO_ASSETS.length).toBeGreaterThan(0)

    for (const asset of PUBLIC_AUDIO_ASSETS) {
      expectValidHttpsUrl(asset.url)
      expect(asset.url).toMatch(/\.mp3$/)
      expect(asset.durationSeconds).toBeGreaterThan(0)
      expect(asset.sampleRate).toBeGreaterThan(0)
      expect(asset.channels).toBeGreaterThan(0)
    }
  })

  it('音频时长从秒级跨到 5 分钟以上', () => {
    const durations = PUBLIC_AUDIO_ASSETS.map((asset) => asset.durationSeconds)

    expect(durations.some((duration) => duration < 5)).toBe(true)
    expect(durations.some((duration) => duration >= 300)).toBe(true)
  })
})
