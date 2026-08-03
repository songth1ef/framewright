import { describe, expect, it } from 'vitest'
import { createBoxNode, createFrameNode } from './node-schema'
import {
  collectNodeIds,
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
