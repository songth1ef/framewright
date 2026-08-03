import {
  SHAPE_TYPES,
  assertShapeCoverage,
  isBoxNode,
  isFrameNode,
  type CanvasNode,
  type Point,
  type ShapeType,
} from '@framewright/core'
import type { CSSProperties, ReactNode } from 'react'
import { toNodeStyle } from '../node-style'

export interface ShapeProps {
  node: CanvasNode
  absolute: Point
  selected: boolean
  children?: ReactNode
}

export type ShapeComponent = (props: ShapeProps) => ReactNode

const SELECTED_OUTLINE = '2px solid #5B8091'

function withSelection(style: CSSProperties, selected: boolean): CSSProperties {
  return selected ? { ...style, outline: SELECTED_OUTLINE } : style
}

function FrameShape({ node, absolute, selected, children }: ShapeProps): ReactNode {
  const base = toNodeStyle(node, absolute)
  const style: CSSProperties = {
    ...base,
    background: isFrameNode(node) && node.background !== null ? node.background : 'transparent',
    overflow: isFrameNode(node) && node.clip ? 'hidden' : 'visible',
  }
  return (
    <div data-fw-id={node.fwId} data-fw-type="frame" style={withSelection(style, selected)}>
      {children}
    </div>
  )
}

function BoxShape({ node, absolute, selected }: ShapeProps): ReactNode {
  const base = toNodeStyle(node, absolute)
  const style: CSSProperties = {
    ...base,
    background: isBoxNode(node) ? node.fill : 'transparent',
    borderRadius: isBoxNode(node) ? `${node.cornerRadius}px` : undefined,
  }
  return <div data-fw-id={node.fwId} data-fw-type="box" style={withSelection(style, selected)} />
}

/**
 * P0 尚未实现的 shape 的显式占位。
 * 不留空——留空会让 assertShapeCoverage 报错，而「暂不支持」是一种被记录的状态，
 * 正好喂给 docs/architecture.md §8.2 的实现成本对照表。
 */
function makeUnsupportedShape(type: ShapeType): ShapeComponent {
  return function UnsupportedShape({ node, absolute, selected }: ShapeProps): ReactNode {
    const style: CSSProperties = {
      ...toNodeStyle(node, absolute),
      background: 'repeating-linear-gradient(45deg,#EEE,#EEE 8px,#DDD 8px,#DDD 16px)',
      border: '1px dashed #999',
    }
    return (
      <div
        data-fw-id={node.fwId}
        data-fw-type={type}
        data-fw-unsupported="true"
        style={withSelection(style, selected)}
      />
    )
  }
}

export const DOM_SHAPES: Record<ShapeType, ShapeComponent> = {
  frame: FrameShape,
  box: BoxShape,
  img: makeUnsupportedShape('img'),
  video: makeUnsupportedShape('video'),
}

assertShapeCoverage('dom', DOM_SHAPES)

export { SHAPE_TYPES }
