export interface DragSnapshot {
  fwId: string
  x: number
  y: number
}

export interface ZoomSnapshot {
  scale: number
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

export function buildDragEvidence(start: DragSnapshot, end: DragSnapshot): DragEvidence
export function buildZoomEvidence(start: ZoomSnapshot, end: ZoomSnapshot): ZoomEvidence
