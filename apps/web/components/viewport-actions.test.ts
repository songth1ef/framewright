import { describe, expect, it } from 'vitest'
import { centerContentAtActualSize, setActualSize, zoomViewport } from './viewport-actions'

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
})
