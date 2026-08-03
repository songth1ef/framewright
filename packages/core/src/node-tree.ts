import { type CanvasNode, isFrameNode } from './node-schema'

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
