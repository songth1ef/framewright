import {
  type CanvasNode,
  type FrameNode,
  isAiImageNode,
  isAiVideoNode,
  isFrameNode,
} from './node-schema'

export interface NodeSlot {
  parentFwId: string
  index: number
  x: number
  y: number
}

export interface InboundRef {
  fwId: string
  index: number
  targetFwId: string
}

type AtomicCanvasOp =
  | {
      kind: 'add-node'
      slot: NodeSlot
      node: CanvasNode
      inboundRefs: readonly InboundRef[]
    }
  | {
      kind: 'remove-node'
      slot: NodeSlot
      node: CanvasNode
      inboundRefs: readonly InboundRef[]
    }
  | { kind: 'move-node'; fwId: string; from: NodeSlot; to: NodeSlot }
  | {
      kind: 'update-node'
      fwId: string
      before: Partial<CanvasNode>
      after: Partial<CanvasNode>
    }

export type CanvasOp = AtomicCanvasOp | { kind: 'batch'; ops: readonly AtomicCanvasOp[] }

function updateNode(root: FrameNode, fwId: string, update: (node: CanvasNode) => CanvasNode): FrameNode {
  const visit = (node: CanvasNode): CanvasNode => {
    if (node.fwId === fwId) return update(node)
    if (!isFrameNode(node)) return node
    let changed = false
    const children = node.children.map((child) => {
      const next = visit(child)
      if (next !== child) changed = true
      return next
    })
    return changed ? { ...node, children } : node
  }

  return visit(root) as FrameNode
}

function removeFromParent(root: FrameNode, parentFwId: string, fwId: string): FrameNode {
  return updateNode(root, parentFwId, (parent) => {
    if (!isFrameNode(parent)) return parent
    const children = parent.children.filter((child) => child.fwId !== fwId)
    return children.length === parent.children.length ? parent : { ...parent, children }
  })
}

function insertIntoParent(root: FrameNode, slot: NodeSlot, node: CanvasNode): FrameNode {
  return updateNode(root, slot.parentFwId, (parent) => {
    if (!isFrameNode(parent)) return parent
    const children = [...parent.children]
    children.splice(slot.index, 0, { ...node, x: slot.x, y: slot.y } as CanvasNode)
    return { ...parent, children }
  })
}

function collectSubtreeFwIds(node: CanvasNode): Set<string> {
  const fwIds = new Set<string>()
  const visit = (current: CanvasNode): void => {
    fwIds.add(current.fwId)
    if (isFrameNode(current)) current.children.forEach(visit)
  }
  visit(node)
  return fwIds
}

function removeInboundRefs(root: FrameNode, targetFwIds: ReadonlySet<string>): FrameNode {
  const visit = (node: CanvasNode): CanvasNode => {
    let next = node
    if (isFrameNode(next)) {
      let changed = false
      const children = next.children.map((child) => {
        const childNext = visit(child)
        if (childNext !== child) changed = true
        return childNext
      })
      if (changed) next = { ...next, children }
    }
    if (isAiImageNode(next) || isAiVideoNode(next)) {
      const sourceFwIds = next.sourceFwIds.filter((fwId) => !targetFwIds.has(fwId))
      if (sourceFwIds.length !== next.sourceFwIds.length) next = { ...next, sourceFwIds }
    }
    return next
  }

  return visit(root) as FrameNode
}

function restoreInboundRefs(
  root: FrameNode,
  inboundRefs: readonly InboundRef[],
): FrameNode {
  const refsByNode = new Map<string, Array<{ index: number; targetFwId: string }>>()
  for (const ref of inboundRefs) {
    const indices = refsByNode.get(ref.fwId) ?? []
    indices.push({ index: ref.index, targetFwId: ref.targetFwId })
    refsByNode.set(ref.fwId, indices)
  }

  let next = root
  for (const [fwId, refs] of refsByNode) {
    next = updateNode(next, fwId, (node) => {
      if (!isAiImageNode(node) && !isAiVideoNode(node)) return node
      const sourceFwIds = [...node.sourceFwIds]
      for (const ref of refs.sort((left, right) => left.index - right.index)) {
        sourceFwIds.splice(ref.index, 0, ref.targetFwId)
      }
      return { ...node, sourceFwIds }
    })
  }
  return next
}

export function applyOp(root: FrameNode, op: CanvasOp): FrameNode {
  switch (op.kind) {
    case 'add-node':
      return restoreInboundRefs(insertIntoParent(root, op.slot, op.node), op.inboundRefs)
    case 'remove-node':
      return removeInboundRefs(
        removeFromParent(root, op.slot.parentFwId, op.node.fwId),
        collectSubtreeFwIds(op.node),
      )
    case 'move-node': {
      const node = findNode(root, op.fwId)
      if (node === null) return root
      return insertIntoParent(removeFromParent(root, op.from.parentFwId, op.fwId), op.to, node)
    }
    case 'update-node':
      return updateNode(root, op.fwId, (node) => ({ ...node, ...op.after }) as CanvasNode)
    case 'batch': {
      let next = root
      for (const childOp of op.ops) next = applyOp(next, childOp)
      return next
    }
  }
}

function findNode(root: CanvasNode, fwId: string): CanvasNode | null {
  if (root.fwId === fwId) return root
  if (!isFrameNode(root)) return null
  for (const child of root.children) {
    const found = findNode(child, fwId)
    if (found !== null) return found
  }
  return null
}

export function invertOp(op: CanvasOp): CanvasOp {
  switch (op.kind) {
    case 'add-node':
      return { ...op, kind: 'remove-node' }
    case 'remove-node':
      return { ...op, kind: 'add-node' }
    case 'move-node':
      return { ...op, from: op.to, to: op.from }
    case 'update-node':
      return { ...op, before: op.after, after: op.before }
    case 'batch':
      return { kind: 'batch', ops: [...op.ops].reverse().map(invertOp) as AtomicCanvasOp[] }
  }
}

export interface MemoryHistory {
  record(op: CanvasOp): void
  undo(): CanvasOp | null
  redo(): CanvasOp | null
}

export function createMemoryHistory(): MemoryHistory {
  let entries: CanvasOp[] = []
  let cursor = 0

  return {
    record(op) {
      entries = [...entries.slice(0, cursor), op]
      cursor = entries.length
    },
    undo() {
      if (cursor === 0) return null
      cursor -= 1
      return invertOp(entries[cursor]!)
    },
    redo() {
      if (cursor === entries.length) return null
      const op = entries[cursor]!
      cursor += 1
      return op
    },
  }
}
