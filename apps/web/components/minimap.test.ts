import { createBoxNode, createFrameNode, getContentBounds } from '@framewright/core'
import { describe, expect, it } from 'vitest'
import {
  createMinimapDensity,
  createMinimapProjection,
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

describe('minimap density aggregation', () => {
  it('一万节点聚合进固定网格，不产生逐节点绘制模型', () => {
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

    const density = createMinimapDensity(root, getContentBounds(root), 100, 75)

    expect(density.cells).toHaveLength(7_500)
    expect(density.nodeCount).toBe(10_000)
    expect(density.cells.reduce((sum, count) => sum + count, 0)).toBe(10_000)
    expect(density.maxCount).toBeGreaterThan(0)
  })

  it('忽略 root、隐藏节点及隐藏 frame 的后代', () => {
    const root = createFrameNode({
      fwId: 'root',
      width: 100,
      height: 100,
      children: [
        createBoxNode({ fwId: 'visible', x: 10, y: 10 }),
        createBoxNode({ fwId: 'hidden', x: 20, y: 20, visible: false }),
        createFrameNode({
          fwId: 'hidden-frame',
          visible: false,
          children: [createBoxNode({ fwId: 'hidden-child' })],
        }),
      ],
    })

    const density = createMinimapDensity(root, getContentBounds(root), 10, 10)

    expect(density.nodeCount).toBe(1)
    expect(density.cells.reduce((sum, count) => sum + count, 0)).toBe(1)
  })
})
