// @vitest-environment jsdom
import './leafer-test-stub'
import { describe, expect, it } from 'vitest'
import {
  CONNECTION_STYLE,
  createAiImageNode,
  createBoxNode,
  createDemoDocument,
  createFrameNode,
} from '@framewright/core'
import { Ellipse, Path } from 'leafer-ui'
import { buildConnectionLayer, collectConnectionItems } from './connections'

describe('C2-leafer collectConnectionItems', () => {
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

describe('C2-leafer buildConnectionLayer', () => {
  const items = collectConnectionItems(createDemoDocument())

  it('连线层是不可命中的 Group：每条线 = 1 条 Path + 2 个端点圆点', () => {
    const layer = buildConnectionLayer(items, [], 1)
    expect(layer.tag).toBe('Group')
    expect(layer.hittable).toBe(false)
    const children = layer.children ?? []
    expect(children).toHaveLength(2 * 3)
    const paths = children.filter((c) => (c as Path).tag === 'Path') as unknown as Path[]
    expect(paths).toHaveLength(2)
    // 贝塞尔路径串与 computeConnectionCurve 的四点一致
    expect(paths[0]?.path).toBe('M 600 350 C 640 350, 580 350, 620 350')
    // 端点圆点：半径 endpointRadius，圆心在 p0 / p3
    const dots = children.filter((c) => (c as Ellipse).tag === 'Ellipse') as unknown as Ellipse[]
    expect(dots).toHaveLength(4)
    expect(dots[0]?.width).toBe(CONNECTION_STYLE.endpointRadius * 2)
    expect(dots[0]?.x).toBe(600 - CONNECTION_STYLE.endpointRadius)
    expect(dots[0]?.y).toBe(350 - CONNECTION_STYLE.endpointRadius)
  })

  it('🔴 线宽按 1/scale 反向补偿：scale=2 时 strokeWidth = 1.5/2', () => {
    const layer = buildConnectionLayer(items, [], 2)
    const path = (layer.children ?? []).find((c) => (c as Path).tag === 'Path') as unknown as Path
    expect(path.stroke).toBe(CONNECTION_STYLE.strokeColor)
    expect(path.strokeWidth).toBe(CONNECTION_STYLE.strokeWidth / 2)
  })

  it('选中源节点时两条线同时高亮', () => {
    const layer = buildConnectionLayer(items, ['ai-image-1'], 1)
    const paths = (layer.children ?? []).filter((c) => (c as Path).tag === 'Path') as unknown as Path[]
    expect(paths).toHaveLength(2)
    for (const p of paths) {
      expect(p.stroke).toBe(CONNECTION_STYLE.highlightColor)
      expect(p.strokeWidth).toBe(CONNECTION_STYLE.highlightWidth)
    }
  })

  it('只选中其中一个派生节点时，仅那一条高亮', () => {
    const layer = buildConnectionLayer(items, ['ai-video-1'], 1)
    const paths = (layer.children ?? []).filter((c) => (c as Path).tag === 'Path') as unknown as Path[]
    const toVideo1 = paths.find((p) => String(p.path).endsWith('620 350'))
    const toVideo2 = paths.find((p) => String(p.path).endsWith('630 110'))
    expect(toVideo1?.stroke).toBe(CONNECTION_STYLE.highlightColor)
    expect(toVideo1?.strokeWidth).toBe(CONNECTION_STYLE.highlightWidth)
    expect(toVideo2?.stroke).toBe(CONNECTION_STYLE.strokeColor)
    expect(toVideo2?.strokeWidth).toBe(CONNECTION_STYLE.strokeWidth)
  })

  it('高亮线宽同样按 1/scale 补偿', () => {
    const layer = buildConnectionLayer(items, ['ai-image-1'], 4)
    const path = (layer.children ?? []).find((c) => (c as Path).tag === 'Path') as unknown as Path
    expect(path.strokeWidth).toBe(CONNECTION_STYLE.highlightWidth / 4)
  })
})
