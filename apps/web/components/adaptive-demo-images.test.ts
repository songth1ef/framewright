import {
  PUBLIC_IMAGE_ASSETS,
  createFrameNode,
  createImgNode,
} from '@framewright/core'
import { describe, expect, it, vi } from 'vitest'
import { prepareDemoImageRequestTier } from './adaptive-demo-images'

describe('demo 图片换档准备', () => {
  it('新档全部预加载完成前不交付新树，完成后才原子切换', async () => {
    const root = createFrameNode({
      fwId: 'root',
      width: 1000,
      height: 1000,
      children: [createImgNode({
        fwId: 'image',
        width: 480,
        height: 270,
        src: PUBLIC_IMAGE_ASSETS[8]!.url,
      })],
    })
    let finishPreload!: () => void
    const preload = vi.fn(() => new Promise<readonly HTMLImageElement[]>((resolve) => {
      finishPreload = () => resolve([])
    }))
    let settled = false

    const pending = prepareDemoImageRequestTier({
      root,
      projection: {
        tier: 8,
        viewportSize: { width: 960, height: 1300 },
        devicePixelRatio: 1,
      },
      viewport: { scale: 8, offsetX: 0, offsetY: 0 },
      viewportSize: { width: 960, height: 1300 },
      cullingLimits: { maxNodes: 1500, maxConnections: 1000 },
      preload,
    }).then((result) => {
      settled = true
      return result
    })

    await Promise.resolve()
    expect(settled).toBe(false)
    expect(preload).toHaveBeenCalledWith([
      'https://picsum.photos/seed/framewright-4k/960/540',
    ])

    finishPreload()
    const result = await pending
    expect(settled).toBe(true)
    expect((result.root.children[0] as { src: string }).src).toContain('/960/540')
  })
})
