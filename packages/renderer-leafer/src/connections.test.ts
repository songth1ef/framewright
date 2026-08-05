// @vitest-environment jsdom
import './leafer-test-stub'
import { describe, expect, it } from 'vitest'
import { CONNECTION_STYLE, collectConnectionItems, createDemoDocument } from '@framewright/core'
import { Ellipse, Path } from 'leafer-ui'
import { buildConnectionLayer, LeaferConnectionLayer } from './connections'

// collectConnectionItems 的锚点/悬空跳过测试在 packages/core/src/connections.test.ts（C2-core 收编后两侧共用）。

describe('C2-leafer buildConnectionLayer', () => {
  const items = collectConnectionItems(createDemoDocument())

  it('千条连线保持逐条 Path 与端点对象，并保留实际挂载连线数', () => {
    const layer = new LeaferConnectionLayer()
    layer.reconcile(Array.from({ length: 1_000 }, () => items[0]!), [], 1, 'curve')

    expect(layer.ui.children).toHaveLength(3_000)
    expect(layer.mountedConnectionCount).toBe(1_000)
    layer.destroy()
  })

  it('连线层是不可命中的 Group：每条线 = 1 条 Path + 2 个端点圆点', () => {
    const layer = buildConnectionLayer(items, [], 1)
    expect(layer.tag).toBe('Group')
    expect(layer.hittable).toBe(false)
    const children = layer.children ?? []
    expect(children).toHaveLength(2 * 3)
    const paths = children.filter((c) => (c as Path).tag === 'Path') as unknown as Path[]
    expect(paths).toHaveLength(2)
    expect(paths[0]?.path).toBe('M 600 350 C 640 350, 580 350, 620 350')
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
    for (const path of paths) {
      expect(path.stroke).toBe(CONNECTION_STYLE.highlightColor)
      expect(path.strokeWidth).toBe(CONNECTION_STYLE.highlightWidth)
    }
  })

  it('只选中其中一个派生节点时，仅那一条高亮', () => {
    const layer = buildConnectionLayer(items, ['ai-video-1'], 1)
    const paths = (layer.children ?? []).filter((c) => (c as Path).tag === 'Path') as unknown as Path[]
    const toVideo1 = paths.find((path) => String(path.path).endsWith('620 350'))
    const toVideo2 = paths.find((path) => String(path.path).endsWith('630 110'))
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

  it('simplified 用 p0 到 p3 的直线，并复用已有 Path 实例', () => {
    const layer = new LeaferConnectionLayer()
    layer.reconcile(items, [], 1, 'curve')
    const path = (layer.ui.children ?? []).find((child) => child instanceof Path) as Path

    layer.reconcile(items, [], 0.25, 'line')

    const nextPath = (layer.ui.children ?? []).find((child) => child instanceof Path) as Path
    expect(nextPath).toBe(path)
    expect(nextPath.path).toBe('M 600 350 L 620 350')
    layer.destroy()
  })

  it('dot 档隐藏整层连线', () => {
    const layer = new LeaferConnectionLayer()
    layer.reconcile(items, [], 1, 'curve')
    expect(layer.ui.children?.length).toBeGreaterThan(0)

    layer.reconcile(items, [], 0.1, 'hidden')

    expect(layer.ui.children ?? []).toHaveLength(0)
    layer.destroy()
  })
})
