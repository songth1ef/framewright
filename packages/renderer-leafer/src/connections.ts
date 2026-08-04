import {
  CONNECTION_STYLE,
  computeConnectionCurve,
  isAiImageNode,
  isAiVideoNode,
  walkTree,
  type CanvasNode,
  type ConnectionCurve,
  type FrameNode,
  type Point,
} from '@framewright/core'
import { Ellipse, Group, Path, type IUI } from 'leafer-ui'

/** 一条待画的溯源连线：两端 fwId + 贝塞尔四点（画布绝对坐标）。 */
export interface ConnectionItem {
  fromFwId: string
  toFwId: string
  curve: ConnectionCurve
}

/**
 * 从 node 树算出全部溯源连线（C2-leafer，规格 docs/connection-spec.md）。
 *
 * - 锚点固定：源节点右边中点 → 本节点左边中点，坐标一律画布绝对坐标
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

/**
 * 把连线画成一个独立的层（Group），调用方负责把它加在**所有节点之下**（规格 §2）。
 *
 * - 连线不是 node：不进 node 树、不可命中（hittable: false）、不进 getRenderedBounds()
 * - 🔴 strokeWidth 恒为视觉像素宽度（规格 §7）：按 1 / viewportScale 反向补偿
 * - 任一端节点在选中集里时整条线高亮（规格 §6）
 */
export function buildConnectionLayer(
  items: readonly ConnectionItem[],
  selection: readonly string[],
  viewportScale: number,
): IUI {
  const layer = new Group({ hittable: false })
  for (const item of items) {
    const highlighted = selection.includes(item.fromFwId) || selection.includes(item.toFwId)
    const stroke = highlighted ? CONNECTION_STYLE.highlightColor : CONNECTION_STYLE.strokeColor
    const strokeWidth =
      (highlighted ? CONNECTION_STYLE.highlightWidth : CONNECTION_STYLE.strokeWidth) / viewportScale
    const { p0, c1, c2, p3 } = item.curve
    layer.add(
      new Path({
        path: `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p3.x} ${p3.y}`,
        stroke,
        strokeWidth,
      }),
    )
    if (CONNECTION_STYLE.endpointRadius > 0) {
      const diameter = CONNECTION_STYLE.endpointRadius * 2
      for (const endpoint of [p0, p3]) {
        layer.add(
          new Ellipse({
            x: endpoint.x - CONNECTION_STYLE.endpointRadius,
            y: endpoint.y - CONNECTION_STYLE.endpointRadius,
            width: diameter,
            height: diameter,
            fill: CONNECTION_STYLE.endpointColor,
          }),
        )
      }
    }
  }
  return layer
}
