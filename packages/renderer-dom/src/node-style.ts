import type { CanvasNode, Point } from '@framewright/core'
import type { CSSProperties } from 'react'

/**
 * node → CSS 的**逐字段显式映射**。
 * 🔴 绝不允许 `{...node}` 展开：node 的字段名与渲染器属性大量同名，
 * 展开会让新增字段静默泄漏、改名不报错。见 docs/domain.md §3.3 规则 7。
 */
export function toNodeStyle(node: CanvasNode, position: Point): CSSProperties {
  return {
    position: 'absolute',
    left: `${position.x}px`,
    top: `${position.y}px`,
    width: `${node.width}px`,
    height: `${node.height}px`,
    opacity: node.opacity,
    transform: `rotate(${node.rotation}deg)`,
    transformOrigin: 'top left',
    display: node.visible ? 'block' : 'none',
    boxSizing: 'border-box',
  }
}
