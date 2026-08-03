import { describe, expect, it } from 'vitest'
import { createBoxNode, createFrameNode } from '@framewright/core'
import { toLeaferProps } from './node-props'

describe('toLeaferProps', () => {
  it('用绝对坐标，几何字段逐个映射', () => {
    const box = createBoxNode({ fwId: 'b', x: 10, y: 20, width: 30, height: 40 })
    const props = toLeaferProps(box, { x: 110, y: 220 })
    expect(props.x).toBe(110)
    expect(props.y).toBe(220)
    expect(props.width).toBe(30)
    expect(props.height).toBe(40)
  })

  it('rotation 与 opacity 与 visible 直接映射', () => {
    const box = createBoxNode({ fwId: 'b', rotation: 45, opacity: 0.5, visible: false })
    const props = toLeaferProps(box, { x: 0, y: 0 })
    expect(props.rotation).toBe(45)
    expect(props.opacity).toBe(0.5)
    expect(props.visible).toBe(false)
  })

  it('🔴 不把 node 的 framewright 字段泄漏进 Leafer 属性', () => {
    const box = createBoxNode({ fwId: 'b', name: 'x' })
    const props = toLeaferProps(box, { x: 0, y: 0 }) as unknown as Record<string, unknown>
    expect(props['fwId']).toBeUndefined()
    expect(props['fwType']).toBeUndefined()
    expect(props['locked']).toBeUndefined()
    expect(props['children']).toBeUndefined()
  })

  it('frame 与 box 走同一份基础映射，形状差异由 registry 负责', () => {
    const frame = createFrameNode({ fwId: 'f', x: 5, y: 5, width: 50, height: 50 })
    const props = toLeaferProps(frame, { x: 5, y: 5 })
    expect(props.x).toBe(5)
    expect(props.width).toBe(50)
  })
})
