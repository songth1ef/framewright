import { describe, expect, it } from 'vitest'
import { createDemoDocument } from './demo-document'
import { createBoxNode, createFrameNode } from './node-schema'
import {
  canvasToScreen,
  clampScale,
  getContentBounds,
  normalizeWheelSteps,
  panBy,
  screenToCanvas,
  zoomAtPoint,
} from './viewport'

describe('坐标换算', () => {
  it('按 viewport 的 offset 与 scale 双向换算', () => {
    const viewport = { scale: 2, offsetX: 30, offsetY: -10 }
    expect(screenToCanvas(viewport, { x: 230, y: 90 })).toEqual({ x: 100, y: 50 })
    expect(canvasToScreen(viewport, { x: 100, y: 50 })).toEqual({ x: 230, y: 90 })
  })

  it('scale 非 1 时往返换算保持原坐标', () => {
    const viewport = { scale: 0.25, offsetX: -17, offsetY: 43 }
    const screenPoint = { x: 91.5, y: -28.25 }
    const result = canvasToScreen(viewport, screenToCanvas(viewport, screenPoint))
    expect(result.x).toBeCloseTo(screenPoint.x)
    expect(result.y).toBeCloseTo(screenPoint.y)
  })
})

describe('panBy', () => {
  it('平移累加屏幕 delta，不受 scale 影响', () => {
    expect(panBy({ scale: 4, offsetX: 10, offsetY: -20 }, 30, -15)).toEqual({
      scale: 4,
      offsetX: 40,
      offsetY: -35,
    })
  })
})

describe('clampScale', () => {
  it('把超出范围的 scale 钳制到上下界', () => {
    expect(clampScale(0.05, 0.1, 4)).toBe(0.1)
    expect(clampScale(8, 0.1, 4)).toBe(4)
  })

  it('保留范围内及恰好位于边界的 scale', () => {
    expect(clampScale(0.1, 0.1, 4)).toBe(0.1)
    expect(clampScale(2, 0.1, 4)).toBe(2)
    expect(clampScale(4, 0.1, 4)).toBe(4)
  })
})

describe('zoomAtPoint', () => {
  const anchor = { x: 200, y: 150 }
  const limits = { min: 0.1, max: 4 }

  function expectAnchorUnchanged(scale: number, factor: number, expectedScale: number): void {
    const viewport = { scale, offsetX: 30, offsetY: 50 }
    const anchorCanvas = screenToCanvas(viewport, anchor)
    const result = zoomAtPoint(viewport, anchor, factor, limits)
    const projected = canvasToScreen(result, anchorCanvas)
    expect(result.scale).toBe(expectedScale)
    expect(projected.x).toBeCloseTo(anchor.x)
    expect(projected.y).toBeCloseTo(anchor.y)
  }

  it('放大后光标下的画布点仍在原屏幕位置', () => {
    expectAnchorUnchanged(1, 2, 2)
  })

  it('缩小后光标下的画布点仍在原屏幕位置', () => {
    expectAnchorUnchanged(1, 0.5, 0.5)
  })

  it('撞到最大 scale 时仍使用钳制值保持锚点', () => {
    expectAnchorUnchanged(3, 2, 4)
  })

  it('撞到最小 scale 时仍使用钳制值保持锚点', () => {
    expectAnchorUnchanged(0.2, 0.1, 0.1)
  })
})

describe('normalizeWheelSteps', () => {
  it('把像素 delta 按每 100px 一格归一化', () => {
    expect(normalizeWheelSteps(100, 0)).toBe(1)
    expect(normalizeWheelSteps(-25, 0)).toBe(-0.25)
  })

  it('先把行 delta 按每行 16px 折算', () => {
    expect(normalizeWheelSteps(6.25, 1)).toBe(1)
  })

  it('先把页 delta 按每页 400px 折算', () => {
    expect(normalizeWheelSteps(0.5, 2)).toBe(2)
  })
})

describe('getContentBounds', () => {
  it('返回固定 demo 全部节点的画布包围盒', () => {
    expect(getContentBounds(createDemoDocument())).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 450,
    })
  })

  it('用逐层累加后的绝对矩形计算并集', () => {
    const nestedBox = createBoxNode({
      fwId: 'nested-box',
      x: -30,
      y: 40,
      width: 10,
      height: 15,
    })
    const inner = createFrameNode({
      fwId: 'inner',
      x: 100,
      y: 50,
      width: 20,
      height: 20,
      children: [nestedBox],
    })
    const root = createFrameNode({
      fwId: 'root',
      x: 10,
      y: 20,
      width: 50,
      height: 40,
      children: [inner],
    })

    expect(getContentBounds(root)).toEqual({ x: 10, y: 20, width: 120, height: 105 })
  })

  it('root 无子节点时返回 root 自身矩形', () => {
    const root = createFrameNode({ fwId: 'root', x: 12, y: 34, width: 56, height: 78 })
    expect(getContentBounds(root)).toEqual({ x: 12, y: 34, width: 56, height: 78 })
  })
})
