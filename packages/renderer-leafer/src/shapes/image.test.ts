// @vitest-environment jsdom
// 🔴 任何 import leafer-ui 的测试文件必须把桩放在第一个 import（见桩内注释）
import '../leafer-test-stub'
import { createImgNode } from '@framewright/core'
import { Rect } from 'leafer-ui'
import { describe, expect, it } from 'vitest'
import { createImageShape } from './image'

function fixture(init: Partial<Parameters<typeof createImgNode>[0]> = {}) {
  return createImgNode({
    fwId: 'img-1',
    name: '参考图片',
    x: 10,
    y: 20,
    width: 320,
    height: 240,
    rotation: 5,
    opacity: 0.75,
    locked: true,
    src: 'http://probe.local/reference.png',
    fit: 'contain',
    ...init,
  })
}

describe('createImageShape', () => {
  it('有 src 时渲染真实图片 paint，并映射几何与 fit', () => {
    const factory = createImageShape()
    const ui = factory({
      node: fixture({ fit: 'cover' }),
      position: { x: 10, y: 20 },
      selected: false,
    })

    expect(ui).toBeInstanceOf(Rect)
    expect(ui.x).toBe(10)
    expect(ui.y).toBe(20)
    expect(ui.width).toBe(320)
    expect(ui.height).toBe(240)
    expect(ui.rotation).toBe(5)
    expect(ui.opacity).toBe(0.75)
    expect(ui.fill).toEqual({
      type: 'image',
      url: 'http://probe.local/reference.png',
      mode: 'cover',
    })
  })

  it('fit 映射：contain→fit / cover→cover / fill→stretch', () => {
    const factory = createImageShape()
    for (const [fit, mode] of [
      ['contain', 'fit'],
      ['cover', 'cover'],
      ['fill', 'stretch'],
    ] as const) {
      const ui = factory({
        node: fixture({ fit }),
        position: { x: 0, y: 0 },
        selected: false,
      })
      expect((ui.fill as unknown as Record<string, unknown>)['mode']).toBe(mode)
    }
  })

  it('无 src 时渲染稳定占位，不创建空 URL 的 image paint', () => {
    const factory = createImageShape()
    const ui = factory({
      node: fixture({ src: '' }),
      position: { x: 0, y: 0 },
      selected: false,
    })

    expect(ui).toBeInstanceOf(Rect)
    expect(ui.fill).toBe('#DDDDDD')
    expect(ui.stroke).toBe('#999999')
    expect(ui.dashPattern).toEqual([4, 4])
  })

  it('不泄漏：paint 仅含白名单字段，节点属性不接收内部字段', () => {
    const factory = createImageShape()
    const ui = factory({ node: fixture(), position: { x: 0, y: 0 }, selected: false })
    const fill = ui.fill as unknown as Record<string, unknown>
    const raw = ui as unknown as Record<string, unknown>

    expect(Object.keys(fill).sort()).toEqual(['mode', 'type', 'url'])
    expect(raw['fwId']).toBeUndefined()
    expect(raw['fwType']).toBeUndefined()
    expect(raw['locked']).not.toBe(true)
    expect(raw['children']).toBeUndefined()
    // Leafer 原生 name 默认是空串；只要没有接收到 fixture 的业务名称，就未泄漏。
    expect(raw['name']).toBe('')
  })

  it('拒绝非 img 节点', () => {
    const factory = createImageShape()
    expect(() =>
      factory({
        node: { ...fixture(), fwType: 'box' } as never,
        position: { x: 0, y: 0 },
        selected: false,
      }),
    ).toThrow()
  })
})
