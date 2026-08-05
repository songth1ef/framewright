import { describe, expect, it } from 'vitest'
import {
  centerContentAtActualSize,
  fitContent,
  setActualSize,
  zoomViewport,
} from './viewport-actions'

const size = { width: 800, height: 450 }

describe('工具栏视口动作', () => {
  it('按倍率缩放并以视口中心为锚点', () => {
    const next = zoomViewport({ scale: 1, offsetX: 0, offsetY: 0 }, size, 1.1)
    expect(next.scale).toBeCloseTo(1.1)
    expect(next.offsetX).toBeCloseTo(-40)
    expect(next.offsetY).toBeCloseTo(-22.5)
  })

  it('100% 保持当前视口中心指向的画布点不动', () => {
    expect(setActualSize({ scale: 2, offsetX: 100, offsetY: 50 }, size)).toEqual({
      scale: 1,
      offsetX: 250,
      offsetY: 137.5,
    })
  })

  it('适应画布回到 100% 并把内容居中', () => {
    expect(
      centerContentAtActualSize({ x: 100, y: 50, width: 400, height: 200 }, size),
    ).toEqual({ scale: 1, offsetX: 100, offsetY: 75 })
  })

  it('适应内容时四周保留 5% 边距', () => {
    expect(fitContent({ x: 100, y: 50, width: 400, height: 200 }, size)).toEqual({
      scale: 1.8,
      offsetX: -140,
      offsetY: -45,
    })
  })

  it('适应内容仍遵守 10%–400% 缩放范围', () => {
    expect(fitContent({ x: 0, y: 0, width: 10, height: 10 }, size).scale).toBe(4)
    expect(fitContent({ x: 0, y: 0, width: 20_000, height: 20_000 }, size).scale).toBe(0.1)
  })
})
