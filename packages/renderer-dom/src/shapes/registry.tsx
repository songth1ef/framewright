import {
  SHAPE_TYPES,
  assertShapeCoverage,
  isAiImageNode,
  isAiVideoNode,
  isBoxNode,
  isFrameNode,
  type CanvasNode,
  type Point,
  type RendererCallbacks,
  type ShapeType,
} from '@framewright/core'
import type { CSSProperties, ReactNode } from 'react'
import { toNodeStyle } from '../node-style'
import { GenerationUnit } from './generation-unit'
import { VideoShape } from './video'

export interface ShapeProps {
  node: CanvasNode
  position: Point
  size?: { width: number; height: number }
  selected: boolean
  active: boolean
  viewportScale: number
  cumulativeRotation: number
  onNodeAction: RendererCallbacks['onNodeAction']
  onNodesDelete: RendererCallbacks['onNodesDelete']
  children?: ReactNode
}

export type ShapeComponent = (props: ShapeProps) => ReactNode

function FrameShape({ node, position, size, children }: ShapeProps): ReactNode {
  const base = toNodeStyle(node, position, size)
  const style: CSSProperties = {
    ...base,
    background: isFrameNode(node) && node.background !== null ? node.background : 'transparent',
    overflow: isFrameNode(node) && node.clip ? 'hidden' : 'visible',
  }
  return (
    <div data-fw-id={node.fwId} data-fw-type="frame" style={style}>
      {children}
    </div>
  )
}

function BoxShape({ node, position, size }: ShapeProps): ReactNode {
  const base = toNodeStyle(node, position, size)
  const style: CSSProperties = {
    ...base,
    background: isBoxNode(node) ? node.fill : 'transparent',
    borderRadius: isBoxNode(node) ? `${node.cornerRadius}px` : undefined,
  }
  return <div data-fw-id={node.fwId} data-fw-type="box" style={style} />
}

function GenerationUnitShape({
  node,
  position,
  size,
  selected,
  active,
  viewportScale,
  cumulativeRotation,
  onNodeAction,
  onNodesDelete,
}: ShapeProps): ReactNode {
  if (!isAiImageNode(node) && !isAiVideoNode(node)) return null
  return (
    <GenerationUnit
      node={node}
      position={position}
      size={size}
      selected={selected}
      active={active}
      viewportScale={viewportScale}
      cumulativeRotation={cumulativeRotation}
      onNodeAction={onNodeAction}
      onNodesDelete={onNodesDelete}
    />
  )
}

/**
 * P0 尚未实现的 shape 的显式占位。
 * 不留空——留空会让 assertShapeCoverage 报错，而「暂不支持」是一种被记录的状态，
 * 正好喂给 docs/architecture.md §8.2 的实现成本对照表。
 */
function makeUnsupportedShape(type: ShapeType): ShapeComponent {
  return function UnsupportedShape({ node, position, size }: ShapeProps): ReactNode {
    const style: CSSProperties = {
      ...toNodeStyle(node, position, size),
      background: 'repeating-linear-gradient(45deg,#EEE,#EEE 8px,#DDD 8px,#DDD 16px)',
      border: '1px dashed #999',
    }
    return (
      <div
        data-fw-id={node.fwId}
        data-fw-type={type}
        data-fw-unsupported="true"
        style={style}
      />
    )
  }
}

export const DOM_SHAPES: Record<ShapeType, ShapeComponent> = {
  frame: FrameShape,
  box: BoxShape,
  img: makeUnsupportedShape('img'),
  video: VideoShape,
  'ai-image': GenerationUnitShape,
  'ai-video': GenerationUnitShape,
}

assertShapeCoverage('dom', DOM_SHAPES)

export { SHAPE_TYPES }
