import { describe, expect, it } from 'vitest'
import { createBoxNode, createFrameNode } from './node-schema'
import { collectNodesInRect, hitTestPoint, intersects, rectFromPoints } from './hit-test'

function makeTree() {
  const hiddenFrame = createFrameNode({
    fwId: 'hidden-frame',
    x: 300,
    y: 10,
    width: 80,
    height: 80,
    visible: false,
    children: [createBoxNode({ fwId: 'hidden-child', width: 40, height: 40 })],
  })
  const visibleFrame = createFrameNode({
    fwId: 'visible-frame',
    x: 10,
    y: 200,
    width: 100,
    height: 100,
    children: [
      createBoxNode({ fwId: 'nested', x: 20, y: 20, width: 40, height: 40 }),
    ],
  })
  return createFrameNode({
    fwId: 'root',
    width: 500,
    height: 400,
    children: [
      createBoxNode({ fwId: 'back', x: 10, y: 10, width: 100, height: 100, rotation: 45 }),
      createBoxNode({ fwId: 'front', x: 50, y: 50, width: 100, height: 100 }),
      createBoxNode({ fwId: 'locked', x: 200, y: 10, width: 50, height: 50, locked: true }),
      hiddenFrame,
      visibleFrame,
    ],
  })
}

describe('rectFromPoints', () => {
  const expected = { x: 10, y: 20, width: 20, height: 30 }

  it('从左上拖到右下', () => {
    expect(rectFromPoints({ x: 10, y: 20 }, { x: 30, y: 50 })).toEqual(expected)
  })

  it('从右下拖到左上', () => {
    expect(rectFromPoints({ x: 30, y: 50 }, { x: 10, y: 20 })).toEqual(expected)
  })

  it('从右上拖到左下', () => {
    expect(rectFromPoints({ x: 30, y: 20 }, { x: 10, y: 50 })).toEqual(expected)
  })

  it('从左下拖到右上', () => {
    expect(rectFromPoints({ x: 10, y: 50 }, { x: 30, y: 20 })).toEqual(expected)
  })
})

describe('intersects', () => {
  const base = { x: 10, y: 10, width: 20, height: 20 }

  it('部分重叠时相交', () => {
    expect(intersects(base, { x: 25, y: 25, width: 20, height: 20 })).toBe(true)
  })

  it('边界恰好接触也算相交', () => {
    expect(intersects(base, { x: 30, y: 15, width: 10, height: 5 })).toBe(true)
  })

  it('完全分离时不相交', () => {
    expect(intersects(base, { x: 30.01, y: 15, width: 10, height: 5 })).toBe(false)
  })
})

describe('collectNodesInRect', () => {
  it('节点只与选框相交但未被完全包含时仍选中', () => {
    expect(collectNodesInRect(makeTree(), { x: 0, y: 0, width: 20, height: 20 })).toEqual([
      'back',
    ])
  })

  it('选框与节点边界恰好接触时仍选中', () => {
    expect(collectNodesInRect(makeTree(), { x: 110, y: 20, width: 5, height: 5 })).toEqual([
      'back',
    ])
  })

  it('完全不重叠时不选中', () => {
    expect(collectNodesInRect(makeTree(), { x: 600, y: 600, width: 10, height: 10 })).toEqual(
      [],
    )
  })

  it('排除 root、locked 与有效不可见子树，并保持深度优先顺序', () => {
    expect(collectNodesInRect(makeTree(), { x: 0, y: 0, width: 500, height: 400 })).toEqual([
      'back',
      'front',
      'visible-frame',
      'nested',
    ])
  })

  it('rotation 首版按未旋转 AABB 判定', () => {
    expect(collectNodesInRect(makeTree(), { x: 10, y: 10, width: 1, height: 1 })).toEqual([
      'back',
    ])
  })
})

describe('hitTestPoint', () => {
  it('重叠区域返回兄弟数组靠后的上层节点', () => {
    expect(hitTestPoint(makeTree(), { x: 60, y: 60 })).toBe('front')
  })

  it('嵌套节点与 frame 同时命中时返回后访问的子节点', () => {
    expect(hitTestPoint(makeTree(), { x: 35, y: 225 })).toBe('nested')
  })

  it('locked 节点不参与点命中', () => {
    expect(hitTestPoint(makeTree(), { x: 220, y: 20 })).toBeNull()
  })

  it('祖先不可见时后代不参与点命中', () => {
    expect(hitTestPoint(makeTree(), { x: 320, y: 20 })).toBeNull()
  })

  it('只命中 root 的空白区域时返回 null', () => {
    expect(hitTestPoint(makeTree(), { x: 490, y: 390 })).toBeNull()
  })
})
