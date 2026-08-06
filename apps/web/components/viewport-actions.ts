import { clampScale, zoomAtPoint, type Rect, type Viewport } from '@framewright/core'

export interface ViewportSize {
  width: number
  height: number
}

// 上限从 400% 提到 800%：真实素材接入后需要放到更大才看得清细节，
// 而 400% 顶到头时用户仍觉得不够。下限 10% 保持不变 ——
// 那一档已实测能撑住 10000 节点 60fps，再往下没有实测背书。
const SCALE_LIMITS = { min: 0.1, max: 8 } as const

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

export function fitContent(bounds: Rect, size: ViewportSize): Viewport {
  const widthScale = bounds.width > 0 ? (size.width * 0.9) / bounds.width : SCALE_LIMITS.max
  const heightScale = bounds.height > 0 ? (size.height * 0.9) / bounds.height : SCALE_LIMITS.max
  const scale = clampScale(Math.min(widthScale, heightScale), SCALE_LIMITS.min, SCALE_LIMITS.max)
  return {
    scale,
    offsetX: (size.width - bounds.width * scale) / 2 - bounds.x * scale,
    offsetY: (size.height - bounds.height * scale) / 2 - bounds.y * scale,
  }
}
