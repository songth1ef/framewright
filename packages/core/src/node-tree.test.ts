import { describe, expect, it } from 'vitest'
import { createAiVideoNode, createBoxNode, createFrameNode } from './node-schema'
import {
  applyNodeMoves,
  applyNodeResizes,
  collectNodeIds,
  deleteNodes,
  findNodeById,
  getAbsolutePosition,
  walkTree,
} from './node-tree'

/** root(0,0) > inner frame(100,50) > box(10,20)  →  box 绝对坐标应为 (110,70) */
function buildTree() {
  const box = createBoxNode({ fwId: 'box', x: 10, y: 20 })
  const inner = createFrameNode({ fwId: 'inner', x: 100, y: 50, children: [box] })
  return createFrameNode({ fwId: 'root', x: 0, y: 0, children: [inner] })
}

describe('getAbsolutePosition', () => {
  it('逐层累加父节点偏移', () => {
    expect(getAbsolutePosition(buildTree(), 'box')).toEqual({ x: 110, y: 70 })
  })

  it('根节点的绝对坐标就是它自己的 x/y', () => {
    expect(getAbsolutePosition(buildTree(), 'root')).toEqual({ x: 0, y: 0 })
  })

  it('找不到返回 null', () => {
    expect(getAbsolutePosition(buildTree(), 'nope')).toBeNull()
  })
})

describe('collectNodeIds', () => {
  it('按深度优先、children 数组顺序返回全部 fwId', () => {
    expect(collectNodeIds(buildTree())).toEqual(['root', 'inner', 'box'])
  })

  it('同层按数组顺序，即 z 序从下到上', () => {
    const a = createBoxNode({ fwId: 'a' })
    const b = createBoxNode({ fwId: 'b' })
    const root = createFrameNode({ fwId: 'root', children: [a, b] })
    expect(collectNodeIds(root)).toEqual(['root', 'a', 'b'])
  })
})

describe('findNodeById', () => {
  it('能找到深层节点', () => {
    expect(findNodeById(buildTree(), 'box')?.fwId).toBe('box')
  })

  it('找不到返回 null', () => {
    expect(findNodeById(buildTree(), 'nope')).toBeNull()
  })
})

describe('walkTree', () => {
  it('每个节点访问一次，并带上绝对坐标', () => {
    const seen: Array<[string, number, number]> = []
    walkTree(buildTree(), (node, absolute) => {
      seen.push([node.fwId, absolute.x, absolute.y])
    })
    expect(seen).toEqual([
      ['root', 0, 0],
      ['inner', 100, 50],
      ['box', 110, 70],
    ])
  })
})

describe('不可变树更新', () => {
  it('移动只更新 parentFwId 指定父节点下的直接 child，并保留未变分支引用', () => {
    const root = buildTree()
    const originalInner = root.children[0]!
    const next = applyNodeMoves(root, [
      { fwId: 'box', parentFwId: 'inner', x: 35, y: 45 },
      { fwId: 'inner', parentFwId: 'wrong-parent', x: 999, y: 999 },
    ])

    expect(next).not.toBe(root)
    expect(next.children[0]).not.toBe(originalInner)
    expect(findNodeById(next, 'box')).toMatchObject({ x: 35, y: 45 })
    expect(findNodeById(next, 'inner')).toMatchObject({ x: 100, y: 50 })
    expect(findNodeById(root, 'box')).toMatchObject({ x: 10, y: 20 })
  })

  it('缩放按父相对坐标更新几何，输入为空时保持根引用', () => {
    const root = buildTree()
    const next = applyNodeResizes(root, [
      { fwId: 'box', parentFwId: 'inner', x: 5, y: 6, width: 70, height: 80 },
    ])

    expect(findNodeById(next, 'box')).toMatchObject({ x: 5, y: 6, width: 70, height: 80 })
    expect(applyNodeResizes(root, [])).toBe(root)
  })

  it('删除 frame 会移除整棵子树，并清理其它生成节点的全部悬空 sourceFwIds', () => {
    const nestedSource = createBoxNode({ fwId: 'nested-source' })
    const deletedFrame = createFrameNode({ fwId: 'deleted-frame', children: [nestedSource] })
    const kept = createBoxNode({ fwId: 'kept' })
    const target = createAiVideoNode({
      fwId: 'target',
      sourceFwIds: ['deleted-frame', 'nested-source', 'kept'],
    })
    const root = createFrameNode({ fwId: 'root', children: [deletedFrame, kept, target] })
    const next = deleteNodes(root, ['deleted-frame'])

    expect(collectNodeIds(next)).toEqual(['root', 'kept', 'target'])
    expect(findNodeById(next, 'target')).toMatchObject({ sourceFwIds: ['kept'] })
    expect(findNodeById(root, 'target')).toMatchObject({
      sourceFwIds: ['deleted-frame', 'nested-source', 'kept'],
    })
  })
})
