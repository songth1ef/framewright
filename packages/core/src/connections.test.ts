import { describe, expect, it } from 'vitest'
import { collectConnectionItems } from './connections'
import { createDemoDocument } from './demo-document'
import { createAiImageNode, createBoxNode, createFrameNode } from './node-schema'

describe('core collectConnectionItems', () => {
  it('demo 文档：1 个 ai-image → 2 个 ai-video，锚点与曲线四点精确符合规格', () => {
    const items = collectConnectionItems(createDemoDocument())
    expect(items).toHaveLength(2)

    // ai-image-1 (440,300,160,100) 右边中点 → ai-video-1 (620,300) 左边中点
    // k = clamp(|620-600|*0.5=10, 40, 160) = 40
    expect(items[0]).toEqual({
      fromFwId: 'ai-image-1',
      toFwId: 'ai-video-1',
      curve: {
        p0: { x: 600, y: 350 },
        c1: { x: 640, y: 350 },
        c2: { x: 580, y: 350 },
        p3: { x: 620, y: 350 },
      },
    })
    // ai-image-1 → ai-video-2 (630,60,160,100) 左边中点 (630,110)
    expect(items[1]).toEqual({
      fromFwId: 'ai-image-1',
      toFwId: 'ai-video-2',
      curve: {
        p0: { x: 600, y: 350 },
        c1: { x: 640, y: 350 },
        c2: { x: 590, y: 110 },
        p3: { x: 630, y: 110 },
      },
    })
  })

  it('嵌套 frame 里的生成单元用画布绝对坐标（walkTree 累加）', () => {
    const inner = createFrameNode({
      fwId: 'f',
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      children: [
        createAiImageNode({ fwId: 'gen', x: 10, y: 10, width: 40, height: 40, sourceFwIds: ['src'] }),
      ],
    })
    const root = createFrameNode({
      fwId: 'root',
      children: [createBoxNode({ fwId: 'src', x: 0, y: 0, width: 20, height: 20 }), inner],
    })
    const items = collectConnectionItems(root)
    expect(items).toHaveLength(1)
    expect(items[0]?.curve.p0).toEqual({ x: 20, y: 10 }) // src 右边中点
    expect(items[0]?.curve.p3).toEqual({ x: 110, y: 130 }) // gen 绝对坐标 (110,110) 左边中点
  })

  it('🔴 悬空引用（源已删）跳过不画、不报错，其余线正常', () => {
    const root = createFrameNode({
      fwId: 'root',
      children: [
        createBoxNode({ fwId: 'real', x: 0, y: 0, width: 20, height: 20 }),
        createAiImageNode({ fwId: 'gen', x: 100, y: 0, sourceFwIds: ['ghost', 'real'] }),
      ],
    })
    const items = collectConnectionItems(root)
    expect(items).toHaveLength(1)
    expect(items[0]?.fromFwId).toBe('real')
  })

  it('非生成单元没有 sourceFwIds，不产生连线', () => {
    const items = collectConnectionItems(
      createFrameNode({ fwId: 'root', children: [createBoxNode({ fwId: 'b' })] }),
    )
    expect(items).toHaveLength(0)
  })
})
