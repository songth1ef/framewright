export type ScaleConnectionPattern = 'none' | 'fanin' | 'distributed'

export interface LeaferScaleProbeScenario {
  readonly id: string
  readonly label: string
  readonly nodeCount: number
  readonly connectionCount: number
  readonly connectionPattern: ScaleConnectionPattern
}

export interface LeaferScaleProbeWorkload {
  readonly renderer: string
  readonly scenarios: readonly LeaferScaleProbeScenario[]
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

export const LEAFER_SCALE_PROBE_WORKLOAD: LeaferScaleProbeWorkload
