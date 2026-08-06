import { describe, expect, it } from 'vitest'
import { PUBLIC_IMAGE_ASSETS, selectDemoImageRequestTier } from './demo-media'
import {
  collectDemoImageRequestUrls,
  rewriteDemoImageRequests,
} from './demo-image-resolution'
import {
  createAiImageNode,
  createAiVideoNode,
  createFrameNode,
  createImgNode,
  createVideoNode,
  isAiImageNode,
  isAiVideoNode,
  isImgNode,
  isVideoNode,
} from './node-schema'
import { walkTree } from './node-tree'
import { CORS_SAFE_PROBE_MEDIA_ASSETS, createScaleFixture } from './scale-fixture'
import { getNodesInViewport } from './viewport-culling'

function mountedRequestPixelBudget(root: ReturnType<typeof createScaleFixture>, scale: number): number {
  const viewportSize = { width: 960, height: 1300 }
  const rewritten = rewriteDemoImageRequests(root, {
    tier: selectDemoImageRequestTier(scale, 1),
    viewportSize,
    devicePixelRatio: 1,
  })
  const mountedFwIds = getNodesInViewport(rewritten, { scale, offsetX: 0, offsetY: 0 }, {
    ...viewportSize,
    maxNodes: 1500,
    maxConnections: 1000,
  })
  let pixels = 0
  walkTree(rewritten, (node) => {
    if (!mountedFwIds.has(node.fwId)) return
    const url = isImgNode(node) || isAiImageNode(node)
      ? node.src
      : isVideoNode(node) || isAiVideoNode(node) ? node.poster : null
    if (url === null || url === '') return
    const segments = new URL(url).pathname.split('/').filter(Boolean)
    pixels += Number(segments.at(-2)) * Number(segments.at(-1))
  })
  return pixels
}

describe('demo 图片请求在共享 node 树中的投影', () => {
  it('同步改写 img、ai-image 与视频 poster，不改真实视频 URL', () => {
    const imageUrl = PUBLIC_IMAGE_ASSETS[8]!.url
    const root = createFrameNode({
      fwId: 'root',
      children: [
        createImgNode({ fwId: 'img', src: imageUrl }),
        createAiImageNode({ fwId: 'ai-image', src: imageUrl, status: 'succeeded' }),
        createVideoNode({ fwId: 'video', src: '/clip.mp4', poster: imageUrl }),
        createAiVideoNode({ fwId: 'ai-video', src: '/ai.mp4', poster: imageUrl, status: 'succeeded' }),
      ],
    })

    const rewritten = rewriteDemoImageRequests(root, {
      tier: 4,
      viewportSize: { width: 960, height: 1300 },
      devicePixelRatio: 1,
    })

    expect(rewritten).not.toBe(root)
    expect(rewritten.children.map((node) => {
      if (node.fwType === 'ai-video' || node.fwType === 'video') return [node.src, node.poster]
      return 'src' in node ? node.src : null
    })).toEqual([
      'https://picsum.photos/seed/framewright-4k/1920/1080',
      'https://picsum.photos/seed/framewright-4k/1920/1080',
      ['/clip.mp4', 'https://picsum.photos/seed/framewright-4k/1920/1080'],
      ['/ai.mp4', 'https://picsum.photos/seed/framewright-4k/1920/1080'],
    ])
  })

  it('逐节点按可见部分封顶，800% 不再为单节点请求完整显示尺寸', () => {
    const imageUrl = PUBLIC_IMAGE_ASSETS.find((asset) => asset.aspectRatio === '3:2')!.url
    const root = createFrameNode({
      fwId: 'root',
      children: [createImgNode({
        fwId: 'image',
        width: 450,
        height: 300,
        src: imageUrl,
      })],
    })

    const rewritten = rewriteDemoImageRequests(root, {
      tier: 8,
      viewportSize: { width: 960, height: 1300 },
      devicePixelRatio: 1,
    })

    expect((rewritten.children[0] as { src: string }).src).toBe(
      'https://picsum.photos/seed/framewright-3x2/1800/1200',
    )
  })

  it('有图片的缩放档总请求像素保持在同一量级', () => {
    const fixture = createScaleFixture({
      nodeCount: 10000,
      connectionPattern: 'many-to-many',
      seed: 7,
      mediaAssets: CORS_SAFE_PROBE_MEDIA_ASSETS,
    })
    const budgets = [8, 1, 0.5].map((scale) => mountedRequestPixelBudget(fixture, scale))

    expect(budgets).toEqual([2160000, 1821948, 1788628])
    expect(Math.max(...budgets) / Math.min(...budgets)).toBeLessThan(2)
  })

  it('只收集当前挂载节点将要切换的唯一 URL', () => {
    const first = PUBLIC_IMAGE_ASSETS[0]!.url
    const second = PUBLIC_IMAGE_ASSETS[1]!.url
    const root = createFrameNode({
      fwId: 'root',
      children: [
        createImgNode({ fwId: 'visible', src: first }),
        createImgNode({ fwId: 'hidden', src: second }),
        createVideoNode({ fwId: 'poster', src: '/clip.mp4', poster: first }),
        createImgNode({ fwId: 'user-image', src: 'https://example.com/user.png' }),
      ],
    })

    expect(collectDemoImageRequestUrls(
      root,
      new Set(['root', 'visible', 'poster', 'user-image']),
    )).toEqual([
      first,
    ])
  })
})
