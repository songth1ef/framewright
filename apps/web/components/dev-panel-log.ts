import type { CanvasOp } from '@framewright/core'

export interface DevLogEntry {
  id: string
  timestamp: string
  fwId: string
  field: string
  oldValue: string
  newValue: string
  gestureId?: string
}

function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return value
  const json = JSON.stringify(value)
  return json ?? String(value)
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right)
}

interface PendingEntry {
  fwId: string
  field: string
  oldValue: string
  newValue: string
}

function atomicOpToEntries(op: Exclude<CanvasOp, { kind: 'batch' }>): PendingEntry[] {
  switch (op.kind) {
    case 'update-node': {
      const fields = [...new Set([...Object.keys(op.before), ...Object.keys(op.after)])]
      return fields.flatMap((field) => {
        const oldValue = (op.before as Record<string, unknown>)[field]
        const newValue = (op.after as Record<string, unknown>)[field]
        if (valuesEqual(oldValue, newValue)) return []
        return [{ fwId: op.fwId, field, oldValue: formatValue(oldValue), newValue: formatValue(newValue) }]
      })
    }
    case 'move-node':
      return (['parentFwId', 'index', 'x', 'y'] as const).flatMap((field) => {
        if (valuesEqual(op.from[field], op.to[field])) return []
        return [{
          fwId: op.fwId,
          field,
          oldValue: formatValue(op.from[field]),
          newValue: formatValue(op.to[field]),
        }]
      })
    case 'add-node':
      return [{ fwId: op.node.fwId, field: '节点', oldValue: '∅', newValue: formatValue(op.node) }]
    case 'remove-node':
      return [{ fwId: op.node.fwId, field: '节点', oldValue: formatValue(op.node), newValue: '∅' }]
  }
}

export function canvasOpToDevLogEntries(op: CanvasOp, timestamp: string): DevLogEntry[] {
  const isGesture = op.kind === 'batch'
  const pending = op.kind === 'batch'
    ? op.ops.flatMap(atomicOpToEntries)
    : atomicOpToEntries(op)
  return pending.map((entry, index) => ({
    ...entry,
    id: `${timestamp}-${index}`,
    timestamp,
    ...(isGesture ? { gestureId: timestamp } : {}),
  }))
}
