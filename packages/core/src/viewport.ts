import type { Point } from './node-tree'
import { walkTree } from './node-tree'
import type { FrameNode } from './node-schema'
import type { Rect, Viewport } from './renderer-adapter'

/** 屏幕坐标转换为画布坐标。 */
export function screenToCanvas(viewport: Viewport, screenPoint: Point): Point {
  return {
    x: (screenPoint.x - viewport.offsetX) / viewport.scale,
    y: (screenPoint.y - viewport.offsetY) / viewport.scale,
  }
}

/** 画布坐标转换为屏幕坐标。 */
export function canvasToScreen(viewport: Viewport, canvasPoint: Point): Point {
  return {
    x: canvasPoint.x * viewport.scale + viewport.offsetX,
    y: canvasPoint.y * viewport.scale + viewport.offsetY,
  }
}

/** 平移 delta 是屏幕空间像素，不随画布 scale 改变。 */
export function panBy(
  viewport: Viewport,
  deltaScreenX: number,
  deltaScreenY: number,
): Viewport {
  return {
    ...viewport,
    offsetX: viewport.offsetX + deltaScreenX,
    offsetY: viewport.offsetY + deltaScreenY,
  }
}

export function clampScale(scale: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, scale))
}

/** 缩放前后，锚点屏幕坐标下的画布点保持不动。 */
export function zoomAtPoint(
  viewport: Viewport,
  anchorScreen: Point,
  factor: number,
  limits: { min: number; max: number },
): Viewport {
  const anchorCanvas = screenToCanvas(viewport, anchorScreen)
  const scale = clampScale(viewport.scale * factor, limits.min, limits.max)
  return {
    scale,
    offsetX: anchorScreen.x - anchorCanvas.x * scale,
    offsetY: anchorScreen.y - anchorCanvas.y * scale,
  }
}

/** 将 WheelEvent.deltaY 统一为每 100px 一格的连续步数。 */
export function normalizeWheelSteps(deltaY: number, deltaMode: number): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY
  return pixels / 100
}

/** 全部节点在画布坐标系下的轴对齐包围盒。 */
export function getContentBounds(root: FrameNode): Rect {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  walkTree(root, (node, absolute) => {
    minX = Math.min(minX, absolute.x)
    minY = Math.min(minY, absolute.y)
    maxX = Math.max(maxX, absolute.x + node.width)
    maxY = Math.max(maxY, absolute.y + node.height)
  })

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}
