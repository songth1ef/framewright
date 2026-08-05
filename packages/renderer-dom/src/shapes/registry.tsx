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
  type ViewportDetailLevel,
} from '@framewright/core'
import type { CSSProperties, ReactNode } from 'react'
import { toNodeStyle } from '../node-style'
import { AudioShape } from './audio'
import { GenerationUnit } from './generation-unit'
import { ImageShape } from './image'
import { VideoShape } from './video'

export interface ShapeProps {
  node: CanvasNode
  position: Point
  size?: { width: number; height: number }
  selected: boolean
  active: boolean
  detail: ViewportDetailLevel
  viewportScale: number
  cumulativeRotation: number
  videoVisible: boolean
  onNodeAction: RendererCallbacks['onNodeAction']
  onNodesDelete: RendererCallbacks['onNodesDelete']
  children?: ReactNode
}

export type ShapeComponent = (props: ShapeProps) => ReactNode

function primaryColor(node: CanvasNode): string {
  if (isFrameNode(node)) return node.background ?? '#E2E8F0'
  if (isBoxNode(node)) return node.fill
  switch (node.fwType) {
    case 'img':
      return '#94A3B8'
    case 'video':
      return '#0F172A'
    case 'audio':
      return '#171A21'
    case 'ai-image':
      return '#7C9AAA'
    case 'ai-video':
      return '#526879'
  }
}

/** simplified / dot 每节点严格只产出一个元素；frame 的同一个元素兼作子树容器。 */
export function LodShape({
  node,
  position,
  size,
  detail,
  viewportScale,
  children,
}: ShapeProps): ReactNode {
  const style: CSSProperties = {
    ...toNodeStyle(node, position, size),
    background: primaryColor(node),
    border:
      detail === 'simplified' ? `${1 / viewportScale}px solid rgba(15, 23, 42, 0.45)` : 0,
    borderRadius:
      detail === 'simplified' && isBoxNode(node) ? `${node.cornerRadius}px` : undefined,
    overflow: isFrameNode(node) && node.clip ? 'hidden' : 'visible',
  }
  return (
    <div data-fw-id={node.fwId} data-fw-type={node.fwType} data-fw-lod-node={detail} style={style}>
      {isFrameNode(node) ? children : null}
    </div>
  )
}

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
  videoVisible,
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
      mountVideo={videoVisible}
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
  audio: AudioShape,
  'ai-image': GenerationUnitShape,
  'ai-video': GenerationUnitShape,
}

assertShapeCoverage('dom', DOM_SHAPES)

export { SHAPE_TYPES }
