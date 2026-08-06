import { describe, expect, it } from 'vitest'
import {
  PUBLIC_IMAGE_ASSETS,
  getDemoImageRequest,
  selectDemoImageRequestTier,
} from './demo-media'

describe('demo 图片自适应请求', () => {
  it('按画布缩放乘 devicePixelRatio 选择 2 的幂档位', () => {
    expect(selectDemoImageRequestTier(0.1, 2)).toBe(0.25)
    expect(selectDemoImageRequestTier(0.5, 2)).toBe(1)
    expect(selectDemoImageRequestTier(1, 2)).toBe(2)
    expect(selectDemoImageRequestTier(2, 2)).toBe(4)
    expect(selectDemoImageRequestTier(8, 2)).toBe(8)
  })

  it('升档及时、降档带迟滞，边界附近不会反复横跳', () => {
    expect(selectDemoImageRequestTier(1.01, 1, 1)).toBe(2)
    expect(selectDemoImageRequestTier(0.99, 1, 2)).toBe(2)
    expect(selectDemoImageRequestTier(0.81, 1, 2)).toBe(2)
    expect(selectDemoImageRequestTier(0.79, 1, 2)).toBe(1)
  })

  it('请求尺寸按素材格子同宽高比放大，并封顶在声明的源分辨率内', () => {
    const wide = PUBLIC_IMAGE_ASSETS.find((asset) => asset.aspectRatio === '21:9')!
    const request = getDemoImageRequest(wide, 8)

    expect(request.width).toBe(2520)
    expect(request.height).toBe(1080)
    expect(request.width).toBeLessThanOrEqual(wide.width)
    expect(request.height).toBeLessThanOrEqual(wide.height)
    expect(request.width * 9).toBe(request.height * 21)
    expect(request.url).toContain('/2520/1080')
  })

  it('节点大于视口时按可见部分封顶，再向上取 2 的幂档位', () => {
    const asset = PUBLIC_IMAGE_ASSETS.find((candidate) => candidate.aspectRatio === '3:2')!
    const request = getDemoImageRequest(asset, 8, {
      nodeSize: { width: 450, height: 300 },
      viewportSize: { width: 960, height: 1300 },
      devicePixelRatio: 1,
    })

    // 800% 下节点显示为 3600×2400，但可见宽度最多 960px；2.13× 向上取 4× 档。
    expect(request).toEqual({
      url: 'https://picsum.photos/seed/framewright-3x2/1800/1200',
      width: 1800,
      height: 1200,
    })
    expect(request.width * 2).toBe(request.height * 3)
    expect(request.width * request.height).toBeLessThan(960 * 1300 * 2)
  })

  it('视口封顶仍受声明源分辨率约束', () => {
    const asset = PUBLIC_IMAGE_ASSETS.find((candidate) => candidate.resolutionTier === '720p')!
    const request = getDemoImageRequest(asset, 8, {
      nodeSize: { width: 480, height: 270 },
      viewportSize: { width: 4000, height: 4000 },
      devicePixelRatio: 2,
    })

    expect(request.width).toBeLessThanOrEqual(asset.width)
    expect(request.height).toBeLessThanOrEqual(asset.height)
  })

  it('改变请求档位不修改 9 种宽高比与声明分辨率档位', () => {
    const metadataBefore = PUBLIC_IMAGE_ASSETS.map(
      ({ id, width, height, aspectRatio, resolutionTier }) =>
        ({ id, width, height, aspectRatio, resolutionTier }),
    )

    for (const asset of PUBLIC_IMAGE_ASSETS) getDemoImageRequest(asset, 8)

    expect(new Set(PUBLIC_IMAGE_ASSETS.map((asset) => asset.aspectRatio)).size).toBe(9)
    expect(new Set(PUBLIC_IMAGE_ASSETS.map((asset) => asset.resolutionTier))).toEqual(
      new Set(['720p', '1K', '2K', '4K', '8K']),
    )
    expect(PUBLIC_IMAGE_ASSETS.map(
      ({ id, width, height, aspectRatio, resolutionTier }) =>
        ({ id, width, height, aspectRatio, resolutionTier }),
    )).toEqual(metadataBefore)
  })

  it('视口尺寸为 0（尚未测量）时不封顶也不抛错', () => {
    // 🔴 真实崩溃回归：ResizeObserver 在容器隐藏、或首次布局完成前会以 0×0 触发，
    // 原实现一律 assert「必须是正有限数」，整个画布页面直接抛 RangeError 崩掉。
    // 「尚未测量」是合法瞬时状态，必须和「值算错了」区别对待。
    const asset = PUBLIC_IMAGE_ASSETS[0]!
    const zeroViewport = {
      nodeSize: { width: 480, height: 300 },
      viewportSize: { width: 0, height: 0 },
      devicePixelRatio: 2,
    }

    expect(() => getDemoImageRequest(asset, 4, zeroViewport)).not.toThrow()
    // 尺寸未知时无从封顶，应保持传入档位，等测量到了下一轮自然修正
    expect(getDemoImageRequest(asset, 4, zeroViewport)).toEqual(getDemoImageRequest(asset, 4))
  })

  it('视口尺寸是 NaN / 负数 / Infinity 时仍然抛错', () => {
    // 放过 0 不等于放过一切 —— 这些是真的算错了，不该被悄悄吞掉
    const asset = PUBLIC_IMAGE_ASSETS[0]!
    const base = { nodeSize: { width: 480, height: 300 }, devicePixelRatio: 2 }

    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(() =>
        getDemoImageRequest(asset, 4, { ...base, viewportSize: { width: bad, height: 600 } }),
      ).toThrow(RangeError)
    }
  })
})
