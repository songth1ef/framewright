export interface DragSnapshot { fwId: string; x: number; y: number }
export interface ZoomSnapshot { scale: number }
export interface PanSnapshot { offsetX: number; offsetY: number }

export interface FrameSample {
  frames: number
  elapsedMs: number
  fps: number
  frameTimeMs: { median: number; p95: number; max: number }
  longFrames: number
}

export function buildFrameStats(
  frameDurationsMs: readonly number[],
  longFrameThresholdMs: number,
): FrameSample
export function buildDragEvidence(start: DragSnapshot, end: DragSnapshot): unknown
export function buildZoomEvidence(start: ZoomSnapshot, end: ZoomSnapshot): unknown
export function buildPanEvidence(start: PanSnapshot, end: PanSnapshot): unknown
