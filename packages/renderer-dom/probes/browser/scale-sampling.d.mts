export interface DragSnapshot {
  fwId: string
  x: number
  y: number
}

export interface ZoomSnapshot {
  scale: number
}

export interface PanSnapshot {
  offsetX: number
  offsetY: number
}

export interface DragEvidence {
  fwId: string
  start: { x: number; y: number }
  end: { x: number; y: number }
  delta: { x: number; y: number }
  positionChanged: true
}

export interface ZoomEvidence {
  scaleStart: number
  scaleEnd: number
  scaleDelta: number
  scaleChanged: true
}

export interface PanEvidence {
  start: PanSnapshot
  end: PanSnapshot
  delta: { x: number; y: number }
  offsetChanged: true
}

export interface FrameStats {
  frames: number
  elapsedMs: number
  fps: number
  frameTimeMs: { median: number; p95: number; max: number }
  longFrames: number
}

export function buildFrameStats(frameDurationsMs: readonly number[], longFrameThresholdMs: number): FrameStats
export function buildDragEvidence(start: DragSnapshot, end: DragSnapshot): DragEvidence
export function buildZoomEvidence(start: ZoomSnapshot, end: ZoomSnapshot): ZoomEvidence
export function buildPanEvidence(start: PanSnapshot, end: PanSnapshot): PanEvidence
