import { createBoxNode, type CanvasOp } from '@framewright/core'
import { describe, expect, it } from 'vitest'
import { canvasOpToDevLogEntries } from './dev-panel-log'

describe('canvasOpToDevLogEntries', () => {
  it('update-node 逐字段 diff，忽略值未变化的字段', () => {
    const op: CanvasOp = {
      kind: 'update-node',
      fwId: 'box-1',
      before: { x: 10, y: 20, params: { seed: 1 } },
      after: { x: 11, y: 20, params: { seed: 2 } },
    }

    expect(canvasOpToDevLogEntries(op, '2026-08-04T12:34:56.000Z')).toEqual([
      {
        id: '2026-08-04T12:34:56.000Z-0',
        timestamp: '2026-08-04T12:34:56.000Z',
        fwId: 'box-1',
        field: 'x',
        oldValue: '10',
        newValue: '11',
      },
      {
        id: '2026-08-04T12:34:56.000Z-1',
        timestamp: '2026-08-04T12:34:56.000Z',
        fwId: 'box-1',
        field: 'params',
        oldValue: '{"seed":1}',
        newValue: '{"seed":2}',
      },
    ])
  })

  it('move-node 只记录发生变化的位置字段', () => {
    const op: CanvasOp = {
      kind: 'move-node',
      fwId: 'box-1',
      from: { parentFwId: 'root', index: 0, x: 10, y: 20 },
      to: { parentFwId: 'frame-2', index: 1, x: 30, y: 20 },
    }

    expect(canvasOpToDevLogEntries(op, 'now').map(({ field, oldValue, newValue }) => ({
      field,
      oldValue,
      newValue,
    }))).toEqual([
      { field: 'parentFwId', oldValue: 'root', newValue: 'frame-2' },
      { field: 'index', oldValue: '0', newValue: '1' },
      { field: 'x', oldValue: '10', newValue: '30' },
    ])
  })

  it('add/remove 记录节点增删', () => {
    const node = createBoxNode({ fwId: 'box-1' })
    const base = { slot: { parentFwId: 'root', index: 0, x: 0, y: 0 }, node, inboundRefs: [] }

    expect(canvasOpToDevLogEntries({ kind: 'add-node', ...base }, 'add')[0]).toMatchObject({
      fwId: 'box-1', field: '节点', oldValue: '∅', newValue: JSON.stringify(node),
    })
    expect(canvasOpToDevLogEntries({ kind: 'remove-node', ...base }, 'remove')[0]).toMatchObject({
      fwId: 'box-1', field: '节点', oldValue: JSON.stringify(node), newValue: '∅',
    })
  })

  it('batch 展开多行并以同一 gestureId 标记同一次手势', () => {
    const op: CanvasOp = {
      kind: 'batch',
      ops: [
        { kind: 'update-node', fwId: 'a', before: { x: 0 }, after: { x: 1 } },
        { kind: 'update-node', fwId: 'b', before: { y: 0 }, after: { y: 2 } },
      ],
    }

    const entries = canvasOpToDevLogEntries(op, 'gesture-time')
    expect(entries).toHaveLength(2)
    expect(entries.map((entry) => entry.gestureId)).toEqual(['gesture-time', 'gesture-time'])
  })
})
