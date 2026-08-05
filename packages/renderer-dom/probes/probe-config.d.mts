export interface DomVideoProbeWorkload {
  readonly renderer: string
  readonly concurrency: readonly number[]
  readonly sampleWindowMs: number
  readonly nodeSize: Readonly<{ width: number; height: number }>
  readonly viewport: Readonly<{
    width: number
    height: number
    viewWidth: number
    viewHeight: number
  }>
  readonly viewportRole: string
  readonly audio: string
  readonly longFrameThresholdMs: number
}

export const DOM_VIDEO_PROBE_WORKLOAD: DomVideoProbeWorkload
