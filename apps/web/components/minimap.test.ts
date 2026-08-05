import {
  createAiImageNode,
  createAudioNode,
  createBoxNode,
  createFrameNode,
  createImgNode,
  createVideoNode,
  getContentBounds,
} from '@framewright/core'
import { describe, expect, it } from 'vitest'
import {
  createMinimapDrawItems,
  createMinimapProjection,
  getMinimapVisual,
  hasRenderableMinimapThumbnail,
  MINIMAP_THUMBNAIL_DRAW_LIMIT,
  MinimapBitmapCache,
  shouldDrawMinimapIcon,
  shouldDrawMinimapThumbnail,
  mapMinimapPointToCanvas,
  projectViewportFrame,
  viewportCenteredAt,
} from './minimap'

describe('minimap geometry', () => {
  it('使用 content bounds 的等比投影并可反向映射点击位置', () => {
    const projection = createMinimapProjection(
      { x: 100, y: 50, width: 400, height: 200 },
      { width: 200, height: 150 },
      10,
    )

    expect(projection).toEqual({ scale: 0.45, offsetX: -35, offsetY: 7.5 })
    expect(mapMinimapPointToCanvas({ x: 100, y: 75 }, projection)).toEqual({ x: 300, y: 150 })
  })

  it('视口框与主画布 viewport 使用同一坐标语义', () => {
    const projection = createMinimapProjection(
      { x: 0, y: 0, width: 1000, height: 500 },
      { width: 200, height: 150 },
      10,
    )

    expect(
      projectViewportFrame(
        { scale: 2, offsetX: -200, offsetY: -100 },
        { width: 800, height: 400 },
        projection,
      ),
    ).toEqual({ left: 28, top: 39, width: 72, height: 36 })
  })

  it('点击或拖拽后保持 scale，只把目标画布点移到主视口中心', () => {
    expect(
      viewportCenteredAt(
        { x: 300, y: 125 },
        { scale: 2, offsetX: 0, offsetY: 0 },
        { width: 800, height: 450 },
      ),
    ).toEqual({ scale: 2, offsetX: -200, offsetY: -25 })
  })
})

describe('minimap draw items', () => {
  it('一万节点生成绝对坐标矩形绘制项，不产生逐节点 UI', () => {
    const root = createFrameNode({
      fwId: 'root',
      width: 10_000,
      height: 10_000,
      children: Array.from({ length: 10_000 }, (_, index) =>
        createBoxNode({
          fwId: `box-${index}`,
          x: (index % 100) * 100,
          y: Math.floor(index / 100) * 100,
          width: 20,
          height: 20,
        }),
      ),
    })

    const items = createMinimapDrawItems(root)

    expect(items).toHaveLength(10_000)
    expect(items[0]).toMatchObject({ x: 0, y: 0, width: 20, height: 20 })
    expect(items[9_999]).toMatchObject({ x: 9_900, y: 9_900, width: 20, height: 20 })
  })

  it('累加嵌套 frame 坐标，并忽略 root、隐藏节点及隐藏 frame 的后代', () => {
    const root = createFrameNode({
      fwId: 'root',
      width: 100,
      height: 100,
      children: [
        createBoxNode({ fwId: 'visible', x: 10, y: 10 }),
        createBoxNode({ fwId: 'hidden', x: 20, y: 20, visible: false }),
        createFrameNode({
          fwId: 'visible-frame',
          x: 30,
          y: 40,
          width: 50,
          height: 60,
          children: [createBoxNode({ fwId: 'nested', x: 5, y: 6, width: 7, height: 8 })],
        }),
        createFrameNode({
          fwId: 'hidden-frame',
          visible: false,
          children: [createBoxNode({ fwId: 'hidden-child' })],
        }),
      ],
    })

    const items = createMinimapDrawItems(root)

    expect(items).toEqual([
      expect.objectContaining({ fwId: 'visible', x: 10, y: 10 }),
      expect.objectContaining({ fwId: 'visible-frame', x: 30, y: 40, width: 50, height: 60 }),
      expect.objectContaining({ fwId: 'nested', x: 35, y: 46, width: 7, height: 8 }),
    ])
  })
})

describe('minimap type visuals', () => {
  it('图片、视频、音频使用不同颜色与矢量图标，ai-image 仍归图片类型', () => {
    expect(getMinimapVisual('img')).toEqual({ color: '#2563eb', icon: 'image' })
    expect(getMinimapVisual('ai-image')).toEqual({ color: '#0891b2', icon: 'image' })
    expect(getMinimapVisual('video')).toEqual({ color: '#7c3aed', icon: 'video' })
    expect(getMinimapVisual('audio')).toEqual({ color: '#db2777', icon: 'audio' })
  })

  it('绘制项保留全部节点类型供单 Canvas 分型绘制', () => {
    const root = createFrameNode({
      fwId: 'root',
      children: [
        createImgNode({ fwId: 'image' }),
        createVideoNode({ fwId: 'video' }),
        createAudioNode({ fwId: 'audio' }),
        createAiImageNode({ fwId: 'ai-image' }),
      ],
    })

    expect(createMinimapDrawItems(root).map((item) => item.fwType)).toEqual([
      'img', 'video', 'audio', 'ai-image',
    ])
  })

  it('投影尺寸任一边不足 12px 时只保留颜色，边界值允许图标', () => {
    expect(shouldDrawMinimapIcon(12, 12)).toBe(true)
    expect(shouldDrawMinimapIcon(11.99, 12)).toBe(false)
    expect(shouldDrawMinimapIcon(12, 11.99)).toBe(false)
  })
})

describe('minimap image thumbnails', () => {
  it('只为 img 与 ai-image 显式映射缩略来源，不把视频 poster 混进来', () => {
    const root = createFrameNode({
      fwId: 'root',
      children: [
        createImgNode({ fwId: 'image', src: '/image.png', fit: 'cover' }),
        createAiImageNode({ fwId: 'ai-image', src: '/generated.png', fit: 'contain' }),
        createVideoNode({ fwId: 'video', poster: '/poster.png' }),
      ],
    })

    expect(createMinimapDrawItems(root).map((item) => item.thumbnail)).toEqual([
      { src: '/image.png', fit: 'cover' },
      { src: '/generated.png', fit: 'contain' },
      undefined,
    ])
  })

  it('缩略绘制阈值包含最后一个合法下标并排除紧邻的下一项', () => {
    expect(shouldDrawMinimapThumbnail(MINIMAP_THUMBNAIL_DRAW_LIMIT - 1)).toBe(true)
    expect(shouldDrawMinimapThumbnail(MINIMAP_THUMBNAIL_DRAW_LIMIT)).toBe(false)
  })

  it('缩略内容至少投影为 4×4px 才有辨识价值', () => {
    expect(hasRenderableMinimapThumbnail(4, 4)).toBe(true)
    expect(hasRenderableMinimapThumbnail(3.99, 4)).toBe(false)
    expect(hasRenderableMinimapThumbnail(4, 3.99)).toBe(false)
  })

  it('ImageBitmap 缓存按 src 去重，并在裁剪与销毁时释放', async () => {
    const closed: string[] = []
    const loader = async (src: string): Promise<ImageBitmap> => ({
      width: 32,
      height: 20,
      close: () => closed.push(src),
    }) as ImageBitmap
    const cache = new MinimapBitmapCache(loader)

    const first = cache.get('/a.png')
    const duplicate = cache.get('/a.png')
    await cache.get('/b.png')
    expect(first).toBe(duplicate)

    cache.retainOnly(new Set(['/b.png']))
    await first
    expect(closed).toEqual(['/a.png'])

    cache.dispose()
    expect(closed).toEqual(['/a.png', '/b.png'])
  })
})
