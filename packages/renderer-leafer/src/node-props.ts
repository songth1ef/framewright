import type { CanvasNode, Point } from '@framewright/core'

/** Leafer 节点的基础几何属性。刻意只列我们真正映射的字段。 */
export interface LeaferBaseProps {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  visible: boolean
}

/**
 * node → Leafer 属性的**逐字段显式映射**。
 * 🔴 绝不允许 `new Rect({...node})`：Leafer 的 x/y/width/height/rotation/opacity/
 * visible/name/children 与我方字段全部同名，展开会静默覆盖并让新增字段泄漏。
 * 见 docs/domain.md §3.3 规则 7。
 */
export function toLeaferProps(node: CanvasNode, position: Point): LeaferBaseProps {
  return {
    x: position.x,
    y: position.y,
    width: node.width,
    height: node.height,
    rotation: node.rotation,
    opacity: node.opacity,
    visible: node.visible,
  }
}
