import { findNodeById, walkTree, type Point } from './node-tree'
import { isFrameNode, type FrameNode } from './node-schema'
import type { Rect } from './renderer-adapter'
import { collectVisibleNodeIds } from './visibility'

/** 将任意方向的两个角点归一化为正宽高矩形。 */
export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }
}

/** AABB 相交判定，边界接触也算相交。 */
export function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  )
}

/** 按深度优先顺序收集与选框相交的可选业务单元。 */
export function collectNodesInRect(root: FrameNode, rect: Rect): readonly string[] {
  const visible = new Set(collectVisibleNodeIds(root))
  const matches: string[] = []

  walkTree(root, (node, absolute) => {
    if (node.fwId === root.fwId || node.locked || !visible.has(node.fwId)) return
    const nodeRect: Rect = {
      x: absolute.x,
      y: absolute.y,
      width: node.width,
      height: node.height,
    }
    if (intersects(nodeRect, rect)) matches.push(node.fwId)
  })

  return matches
}

/** 返回深度优先遍历中最后命中的可选节点，即视觉最上层节点。 */
export function hitTestPoint(root: FrameNode, canvasPoint: Point): string | null {
  const visible = new Set(collectVisibleNodeIds(root))
  let hit: string | null = null

  walkTree(root, (node, absolute) => {
    if (node.fwId === root.fwId || node.locked || !visible.has(node.fwId)) return
    const inside =
      canvasPoint.x >= absolute.x &&
      canvasPoint.x <= absolute.x + node.width &&
      canvasPoint.y >= absolute.y &&
      canvasPoint.y <= absolute.y + node.height
    if (inside) hit = node.fwId
  })

  return hit
}

/**
 * 对空间查询给出的候选节点执行与渲染器无关的业务过滤。
 *
 * unified 与 native 模式只替换候选节点的来源；root、锁定节点和无背景 frame
 * 都不属于可选中的业务单元。不存在的 fwId 同样按空命中处理。
 */
export function filterSelectableHitCandidate(
  root: FrameNode,
  candidateFwId: string | null,
): string | null {
  if (candidateFwId === null || candidateFwId === root.fwId) return null

  const candidate = findNodeById(root, candidateFwId)
  if (candidate === null || candidate.locked) return null
  if (isFrameNode(candidate) && candidate.background === null) return null

  return candidateFwId
}
