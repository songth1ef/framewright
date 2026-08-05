import { isFrameNode, type FrameNode, type Rect, type Viewport } from '@framewright/core'
import type { ViewportSize } from './viewport-actions'

export const MINIMAP_WIDTH = 200
export const MINIMAP_HEIGHT = 150
export const MINIMAP_GRID_COLUMNS = 100
export const MINIMAP_GRID_ROWS = 75
export const MINIMAP_PADDING = 8

export interface MinimapProjection {
  scale: number
  offsetX: number
  offsetY: number
}

export interface MinimapDensity {
  cells: Uint32Array
  maxCount: number
  nodeCount: number
}

export interface MinimapViewportFrame {
  left: number
  top: number
  width: number
  height: number
}

interface Point {
  x: number
  y: number
}

export function createMinimapProjection(
  bounds: Rect,
  size: ViewportSize,
  padding: number,
): MinimapProjection {
  const availableWidth = Math.max(1, size.width - padding * 2)
  const availableHeight = Math.max(1, size.height - padding * 2)
  const scale = Math.min(
    bounds.width > 0 ? availableWidth / bounds.width : 1,
    bounds.height > 0 ? availableHeight / bounds.height : 1,
  )
  return {
    scale,
    offsetX: (size.width - bounds.width * scale) / 2 - bounds.x * scale,
    offsetY: (size.height - bounds.height * scale) / 2 - bounds.y * scale,
  }
}

export function mapMinimapPointToCanvas(
  point: Point,
  projection: MinimapProjection,
): Point {
  return {
    x: (point.x - projection.offsetX) / projection.scale,
    y: (point.y - projection.offsetY) / projection.scale,
  }
}

export function viewportCenteredAt(
  canvasPoint: Point,
  viewport: Viewport,
  viewportSize: ViewportSize,
): Viewport {
  return {
    scale: viewport.scale,
    offsetX: viewportSize.width / 2 - canvasPoint.x * viewport.scale,
    offsetY: viewportSize.height / 2 - canvasPoint.y * viewport.scale,
  }
}

export function projectViewportFrame(
  viewport: Viewport,
  viewportSize: ViewportSize,
  projection: MinimapProjection,
): MinimapViewportFrame {
  const canvasLeft = -viewport.offsetX / viewport.scale
  const canvasTop = -viewport.offsetY / viewport.scale
  return {
    left: canvasLeft * projection.scale + projection.offsetX,
    top: canvasTop * projection.scale + projection.offsetY,
    width: (viewportSize.width / viewport.scale) * projection.scale,
    height: (viewportSize.height / viewport.scale) * projection.scale,
  }
}

/** 节点树变化时才执行；万节点最终压进固定 100×75 网格，不产生逐节点 UI。 */
export function createMinimapDensity(
  root: FrameNode,
  bounds: Rect,
  columns: number,
  rows: number,
): MinimapDensity {
  const cells = new Uint32Array(columns * rows)
  let maxCount = 0
  let nodeCount = 0
  const width = Math.max(bounds.width, Number.EPSILON)
  const height = Math.max(bounds.height, Number.EPSILON)

  const visitChildren = (frame: FrameNode, parentX: number, parentY: number): void => {
    for (const node of frame.children) {
      if (!node.visible) continue
      const x = parentX + node.x
      const y = parentY + node.y
      const centerX = x + node.width / 2
      const centerY = y + node.height / 2
      const column = Math.min(columns - 1, Math.max(0, Math.floor(((centerX - bounds.x) / width) * columns)))
      const row = Math.min(rows - 1, Math.max(0, Math.floor(((centerY - bounds.y) / height) * rows)))
      const index = row * columns + column
      const count = (cells[index] ?? 0) + 1
      cells[index] = count
      maxCount = Math.max(maxCount, count)
      nodeCount += 1
      if (isFrameNode(node)) visitChildren(node, x, y)
    }
  }

  visitChildren(root, root.x, root.y)
  return { cells, maxCount, nodeCount }
}
