import {
  CONNECTION_STYLE,
  type ConnectionItem,
} from '@framewright/core'
import { Ellipse, Group, Path, type IUI } from 'leafer-ui'

// 🔴 collectConnectionItems / ConnectionItem 已收编进 core（packages/core/src/connections.ts）——
// 锚点提取规则两侧唯一真相源，本文件只保留 Leafer 专属的绘制层构建。
export type { ConnectionItem }

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
