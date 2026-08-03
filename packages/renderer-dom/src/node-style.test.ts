import { describe, expect, it } from 'vitest'
import { createBoxNode } from '@framewright/core'
import { toNodeStyle } from './node-style'

describe('toNodeStyle', () => {
  it('用绝对坐标定位，几何字段逐个映射', () => {
    const box = createBoxNode({ fwId: 'b', x: 10, y: 20, width: 30, height: 40 })
    const style = toNodeStyle(box, { x: 110, y: 220 })
    expect(style.position).toBe('absolute')
    expect(style.left).toBe('110px')
    expect(style.top).toBe('220px')
    expect(style.width).toBe('30px')
    expect(style.height).toBe('40px')
  })

  it('visible=false 渲染为 display:none，而不是从树里摘掉', () => {
    const box = createBoxNode({ fwId: 'b', visible: false })
    expect(toNodeStyle(box, { x: 0, y: 0 }).display).toBe('none')
  })

  it('rotation 与 opacity 映射到 transform 与 opacity', () => {
    const box = createBoxNode({ fwId: 'b', rotation: 45, opacity: 0.5 })
    const style = toNodeStyle(box, { x: 0, y: 0 })
    expect(style.transform).toBe('rotate(45deg)')
    expect(style.opacity).toBe(0.5)
  })

  it('不把 node 的字段整体带进样式对象', () => {
    const box = createBoxNode({ fwId: 'b', name: 'x' })
    const style = toNodeStyle(box, { x: 0, y: 0 }) as Record<string, unknown>
    expect(style['fwId']).toBeUndefined()
    expect(style['fwType']).toBeUndefined()
    expect(style['locked']).toBeUndefined()
    expect(style['children']).toBeUndefined()
    expect(style['name']).toBeUndefined()
  })
})
