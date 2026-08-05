import { zoomAtPoint, type Rect, type Viewport } from '@framewright/core'

export interface ViewportSize {
  width: number
  height: number
}

const SCALE_LIMITS = { min: 0.1, max: 4 } as const

function centerOf(size: ViewportSize): { x: number; y: number } {
  return { x: size.width / 2, y: size.height / 2 }
}

export function zoomViewport(
  viewport: Viewport,
  size: ViewportSize,
  factor: number,
): Viewport {
  return zoomAtPoint(viewport, centerOf(size), factor, SCALE_LIMITS)
}

export function setActualSize(viewport: Viewport, size: ViewportSize): Viewport {
  return zoomViewport(viewport, size, 1 / viewport.scale)
}

export function centerContentAtActualSize(bounds: Rect, size: ViewportSize): Viewport {
  return {
    scale: 1,
    offsetX: (size.width - bounds.width) / 2 - bounds.x,
    offsetY: (size.height - bounds.height) / 2 - bounds.y,
  }
}
