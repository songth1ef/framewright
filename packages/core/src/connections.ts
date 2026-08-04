import { computeConnectionCurve, type ConnectionCurve } from './connection-style'
import { isAiImageNode, isAiVideoNode, type CanvasNode, type FrameNode } from './node-schema'
import { walkTree, type Point } from './node-tree'

/** 一条待画的溯源连线：两端 fwId + 贝塞尔四点（画布绝对坐标）。 */
export interface ConnectionItem {
  fromFwId: string
  toFwId: string
  curve: ConnectionCurve
}

/**
 * 从 node 树算出全部溯源连线（规格 docs/connection-spec.md）。
 *
 * 🔴 **两侧必须共用本函数**——锚点提取规则（源节点右边中点 → 本节点左边中点、
 * 画布绝对坐标、悬空 sourceFwIds 跳过）与 `k` 公式一样，各写各的必然分叉。
 *
 * - 曲线四点一律走 core.computeConnectionCurve（k 的公式两侧唯一真相源）
 * - 🔴 悬空引用（源已删）跳过不画、不报错——渲染器不负责修数据（规格 §8）
 */
export function collectConnectionItems(root: FrameNode): ConnectionItem[] {
  const geometry = new Map<string, { node: CanvasNode; absolute: Point }>()
  walkTree(root, (node, absolute) => geometry.set(node.fwId, { node, absolute }))

  const items: ConnectionItem[] = []
  for (const { node, absolute } of geometry.values()) {
    if (!isAiImageNode(node) && !isAiVideoNode(node)) continue
    for (const sourceFwId of node.sourceFwIds) {
      const source = geometry.get(sourceFwId)
      if (source === undefined) continue
      const from: Point = {
        x: source.absolute.x + source.node.width,
        y: source.absolute.y + source.node.height / 2,
      }
      const to: Point = { x: absolute.x, y: absolute.y + node.height / 2 }
      items.push({ fromFwId: sourceFwId, toFwId: node.fwId, curve: computeConnectionCurve(from, to) })
    }
  }
  return items
}
