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
import { ImageShape } from './image'
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

export const DOM_SHAPES: Record<ShapeType, ShapeComponent> = {
  frame: FrameShape,
  box: BoxShape,
  img: ImageShape,
  video: VideoShape,
  'ai-image': GenerationUnitShape,
  'ai-video': GenerationUnitShape,
}

assertShapeCoverage('dom', DOM_SHAPES)

export { SHAPE_TYPES }
