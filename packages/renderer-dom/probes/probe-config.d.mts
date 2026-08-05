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

export type ScaleConnectionPattern = 'none' | 'fanin' | 'distributed'

export interface DomScaleProbeScenario {
  readonly id: string
  readonly label: string
  readonly nodeCount: number
  readonly connectionCount: number
  readonly connectionPattern: ScaleConnectionPattern
}

export interface DomScaleProbeWorkload {
  readonly renderer: string
  readonly scenarios: readonly DomScaleProbeScenario[]
  readonly sampleWindowMs: number
  readonly nodeSize: Readonly<{ width: number; height: number }>
  readonly viewport: Readonly<{
    width: number
    height: number
    viewWidth: number
    viewHeight: number
  }>
  readonly viewportRole: string
  readonly layout: Readonly<{
    columns: number
    originX: number
    originY: number
    gapX: number
    gapY: number
  }>
  readonly dragDelta: Readonly<{ x: number; y: number }>
  readonly zoom: Readonly<{ startScale: number; endScale: number }>
  readonly longFrameThresholdMs: number
}

export const DOM_SCALE_PROBE_WORKLOAD: DomScaleProbeWorkload
