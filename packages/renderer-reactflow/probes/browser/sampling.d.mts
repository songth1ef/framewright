export interface FrameStats {
  frames: number
  elapsedMs: number
  fps: number
  frameTimeMs: { median: number; p95: number; max: number }
  longFrames: number
}

export function buildFrameStats(values: number[], threshold: number): FrameStats
export function compareMiniMap(
  withoutMiniMap: { renderMs: number; dragFps: number; panFps: number },
  withMiniMap: { renderMs: number; dragFps: number; panFps: number },
): { renderMsDelta: number; dragFpsDelta: number; panFpsDelta: number }
