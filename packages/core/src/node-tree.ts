import {
  type CanvasNode,
  type FrameNode,
  isAiImageNode,
  isAiVideoNode,
  isFrameNode,
} from './node-schema'

export interface Point {
  x: number
  y: number
}

/**
 * 深度优先遍历。`absolute` 是逐层累加父节点 x/y 后的画布绝对坐标——
 * node 自身的 x/y 是相对父节点的，见 docs/domain.md §3.3 规则 1。
 */
export function walkTree(
  root: CanvasNode,
  visit: (node: CanvasNode, absolute: Point) => void,
): void {
  const step = (node: CanvasNode, parentX: number, parentY: number): void => {
    const x = parentX + node.x
    const y = parentY + node.y
    visit(node, { x, y })
    if (isFrameNode(node)) {
      for (const child of node.children) step(child, x, y)
    }
  }
  step(root, 0, 0)
}

export function findNodeById(root: CanvasNode, fwId: string): CanvasNode | null {
  let found: CanvasNode | null = null
  walkTree(root, (node) => {
    if (found === null && node.fwId === fwId) found = node
  })
  return found
}

export function collectNodeIds(root: CanvasNode): string[] {
  const ids: string[] = []
  walkTree(root, (node) => ids.push(node.fwId))
  return ids
}

export function getAbsolutePosition(root: CanvasNode, fwId: string): Point | null {
  let result: Point | null = null
  walkTree(root, (node, absolute) => {
    if (result === null && node.fwId === fwId) result = absolute
  })
  return result
}

type NodeMove = { fwId: string; parentFwId: string; x: number; y: number }
type NodeResize = NodeMove & { width: number; height: number }

function updateChildrenByParent<T extends NodeMove>(
  root: FrameNode,
  updates: readonly T[],
  apply: (node: CanvasNode, update: T) => CanvasNode,
): FrameNode {
  if (updates.length === 0) return root
  const byParent = new Map<string, Map<string, T>>()
  for (const update of updates) {
    const children = byParent.get(update.parentFwId) ?? new Map<string, T>()
    children.set(update.fwId, update)
    byParent.set(update.parentFwId, children)
  }

  const visit = (frame: FrameNode): FrameNode => {
    const directUpdates = byParent.get(frame.fwId)
    let changed = false
    const children = frame.children.map((child) => {
      const update = directUpdates?.get(child.fwId)
      let next = update === undefined ? child : apply(child, update)
      if (isFrameNode(next)) next = visit(next)
      if (next !== child) changed = true
      return next
    })
    return changed ? { ...frame, children } : frame
  }

  return visit(root)
}

/** 按 parentFwId 定位直接 child，并以父相对坐标不可变地写回移动结果。 */
export function applyNodeMoves(root: FrameNode, moves: readonly NodeMove[]): FrameNode {
  return updateChildrenByParent(root, moves, (node, move) => ({
    ...node,
    x: move.x,
    y: move.y,
  }))
}

/** 按 parentFwId 定位直接 child，不可变地写回缩放后的完整几何。 */
export function applyNodeResizes(root: FrameNode, resizes: readonly NodeResize[]): FrameNode {
  return updateChildrenByParent(root, resizes, (node, resize) => ({
    ...node,
    x: resize.x,
    y: resize.y,
    width: resize.width,
    height: resize.height,
  }))
}

/**
 * 删除节点及其子树，并清理所有保留生成节点中指向被删节点的 sourceFwIds。
 * root 是文档容器，不允许通过本操作删除。
 */
export function deleteNodes(root: FrameNode, fwIds: readonly string[]): FrameNode {
  const requested = new Set(fwIds.filter((fwId) => fwId !== root.fwId))
  if (requested.size === 0) return root

  const removed = new Set<string>()
  walkTree(root, (node) => {
    if (!requested.has(node.fwId)) return
    walkTree(node, (descendant) => removed.add(descendant.fwId))
  })
  if (removed.size === 0) return root

  const visit = (node: CanvasNode): CanvasNode => {
    let next = node
    if (isFrameNode(next)) {
      const keptChildren = next.children.filter((child) => !removed.has(child.fwId))
      const children = keptChildren.map(visit)
      const childrenChanged =
        keptChildren.length !== next.children.length ||
        children.some((child, index) => child !== keptChildren[index])
      if (childrenChanged) next = { ...next, children }
    }
    if (isAiImageNode(next) || isAiVideoNode(next)) {
      const sourceFwIds = next.sourceFwIds.filter((fwId) => !removed.has(fwId))
      if (sourceFwIds.length !== next.sourceFwIds.length) next = { ...next, sourceFwIds }
    }
    return next
  }

  return visit(root) as FrameNode
}
