import { describe, expect, it } from 'vitest'
import { createAiVideoNode, createBoxNode, createFrameNode } from './node-schema'
import {
  applyOp,
  createMemoryHistory,
  invertOp,
  type CanvasOp,
  type NodeSlot,
} from './history'

const slot = (parentFwId: string, index: number, x: number, y: number): NodeSlot => ({
  parentFwId,
  index,
  x,
  y,
})

function buildTree() {
  return createFrameNode({
    fwId: 'root',
    children: [
      createBoxNode({ fwId: 'box-a', x: 10, y: 20, fill: '#111111' }),
      createFrameNode({
        fwId: 'frame-a',
        x: 100,
        y: 50,
        children: [createBoxNode({ fwId: 'box-b', x: 5, y: 6 })],
      }),
      createAiVideoNode({
        fwId: 'video-a',
        sourceFwIds: ['external', 'box-a', 'tail'],
      }),
    ],
  })
}

describe('applyOp / invertOp', () => {
  it('add-node 按 slot 插入节点，逆操作恢复原树', () => {
    const root = buildTree()
    const op: CanvasOp = {
      kind: 'add-node',
      slot: slot('frame-a', 0, 30, 40),
      node: createBoxNode({ fwId: 'box-new', x: 999, y: 999 }),
      inboundRefs: [{ fwId: 'video-a', index: 1 }],
    }

    const next = applyOp(root, op)
    expect(next.children[1]).toMatchObject({
      fwType: 'frame',
      children: [
        { fwId: 'box-new', x: 30, y: 40 },
        { fwId: 'box-b', x: 5, y: 6 },
      ],
    })
    expect(next.children[2]).toMatchObject({
      sourceFwIds: ['external', 'box-new', 'box-a', 'tail'],
    })
    expect(applyOp(next, invertOp(op))).toEqual(root)
  })

  it('remove-node 删除节点、清理外部引用，逆操作恢复节点与引用位置', () => {
    const root = buildTree()
    const op: CanvasOp = {
      kind: 'remove-node',
      slot: slot('root', 0, 10, 20),
      node: root.children[0]!,
      inboundRefs: [{ fwId: 'video-a', index: 1 }],
    }

    const next = applyOp(root, op)
    expect(next.children.map((node) => node.fwId)).toEqual(['frame-a', 'video-a'])
    expect(next.children[1]).toMatchObject({ sourceFwIds: ['external', 'tail'] })
    expect(applyOp(next, invertOp(op))).toEqual(root)
  })

  it('move-node 跨父节点移动并采用目标 slot 坐标，逆操作恢复原树', () => {
    const root = buildTree()
    const op: CanvasOp = {
      kind: 'move-node',
      fwId: 'box-a',
      from: slot('root', 0, 10, 20),
      to: slot('frame-a', 1, 7, 8),
    }

    const next = applyOp(root, op)
    expect(next.children.map((node) => node.fwId)).toEqual(['frame-a', 'video-a'])
    expect(next.children[0]).toMatchObject({
      children: [
        { fwId: 'box-b' },
        { fwId: 'box-a', x: 7, y: 8 },
      ],
    })
    expect(applyOp(next, invertOp(op))).toEqual(root)
  })

  it('update-node 只更新指定字段，逆操作恢复原树', () => {
    const root = buildTree()
    const op: CanvasOp = {
      kind: 'update-node',
      fwId: 'box-a',
      before: { x: 10, y: 20, fill: '#111111' },
      after: { x: 30, y: 40, fill: '#abcdef' },
    }

    const next = applyOp(root, op)
    expect(next.children[0]).toMatchObject({ x: 30, y: 40, fill: '#abcdef' })
    expect(applyOp(next, invertOp(op))).toEqual(root)
  })
})

describe('memory history', () => {
  const update = (x: number, nextX: number): CanvasOp => ({
    kind: 'update-node',
    fwId: 'box-a',
    before: { x },
    after: { x: nextX },
  })

  it('按记录顺序撤销并按原顺序重做', () => {
    const history = createMemoryHistory()
    const first = update(10, 20)
    const second = update(20, 30)
    history.record(first)
    history.record(second)

    expect(history.undo()).toEqual(invertOp(second))
    expect(history.undo()).toEqual(invertOp(first))
    expect(history.undo()).toBeNull()
    expect(history.redo()).toEqual(first)
    expect(history.redo()).toEqual(second)
    expect(history.redo()).toBeNull()
  })

  it('撤销后产生新操作会丢弃 cursor 之后的重做条目', () => {
    const history = createMemoryHistory()
    history.record(update(10, 20))
    history.record(update(20, 30))
    history.undo()
    history.record(update(20, 40))

    expect(history.redo()).toBeNull()
    expect(history.undo()).toEqual(invertOp(update(20, 40)))
    expect(history.undo()).toEqual(invertOp(update(10, 20)))
  })
})
