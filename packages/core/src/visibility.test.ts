import { describe, expect, it } from 'vitest'
import { createBoxNode, createFrameNode, type FrameNode } from './node-schema'
import { collectVisibleNodeIds, isEffectivelyVisible } from './visibility'

function makeTree(): FrameNode {
  return createFrameNode({
    fwId: 'root',
    children: [
      createBoxNode({ fwId: 'leaf' }),
      createFrameNode({
        fwId: 'frame',
        children: [
          createBoxNode({ fwId: 'child' }),
          createFrameNode({
            fwId: 'nested-frame',
            children: [createBoxNode({ fwId: 'nested-child' })],
          }),
        ],
      }),
    ],
  })
}

describe('collectVisibleNodeIds', () => {
  it('全部可见时返回全部 fwId', () => {
    expect(collectVisibleNodeIds(makeTree())).toEqual([
      'root',
      'leaf',
      'frame',
      'child',
      'nested-frame',
      'nested-child',
    ])
  })

  it('叶子节点 visible=false 时只排除它自己', () => {
    const root = makeTree()
    root.children[0]!.visible = false
    expect(collectVisibleNodeIds(root)).toEqual([
      'root',
      'frame',
      'child',
      'nested-frame',
      'nested-child',
    ])
  })

  it('frame visible=false 时排除它与全部后代', () => {
    const root = makeTree()
    root.children[1]!.visible = false
    expect(collectVisibleNodeIds(root)).toEqual(['root', 'leaf'])
  })

  it('多层嵌套中只裁掉不可见 frame 的子树', () => {
    const root = makeTree()
    const frame = root.children[1] as FrameNode
    frame.children[1]!.visible = false
    expect(collectVisibleNodeIds(root)).toEqual(['root', 'leaf', 'frame', 'child'])
  })
})

describe('isEffectivelyVisible', () => {
  it('与 collectVisibleNodeIds 的结果一致', () => {
    const root = makeTree()
    root.children[1]!.visible = false
    const visible = new Set(collectVisibleNodeIds(root))

    for (const fwId of ['root', 'leaf', 'frame', 'child', 'nested-frame', 'nested-child']) {
      expect(isEffectivelyVisible(root, fwId)).toBe(visible.has(fwId))
    }
    expect(isEffectivelyVisible(root, 'missing')).toBe(false)
  })
})
