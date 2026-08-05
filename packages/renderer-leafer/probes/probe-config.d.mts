export type ScaleConnectionPattern = 'none' | 'many-to-many'

export interface LeaferScaleProbeScenario {
  readonly id: string
  readonly label: string
  readonly nodeCount: number
  readonly connectionPattern: ScaleConnectionPattern
  readonly initialScale?: number
}

export interface LeaferScaleProbeWorkload {
  readonly renderer: string
  readonly seed: number
  readonly scenarios: readonly LeaferScaleProbeScenario[]
  readonly sampleWindowMs: number
  readonly viewport: Readonly<{
    width: number
    height: number
    viewWidth: number
    viewHeight: number
  }>
  readonly viewportRole: string
  readonly dragDelta: Readonly<{ x: number; y: number }>
  readonly zoom: Readonly<{ startScale: number; endScale: number }>
  readonly pan: Readonly<{
    startOffsetX: number
    startOffsetY: number
    endOffsetX: number
    endOffsetY: number
  }>
  readonly longFrameThresholdMs: number
}

export const LEAFER_SCALE_PROBE_WORKLOAD: LeaferScaleProbeWorkload

export interface LeaferZoomOutProbeWorkload {
  readonly renderer: string
  readonly seed: 7
  readonly scenarios: readonly (LeaferScaleProbeScenario & { readonly initialScale: number })[]
  readonly sampleWindowMs: number
  readonly caseTimeoutMs: number
  readonly viewport: LeaferScaleProbeWorkload['viewport']
  readonly viewportRole: string
  readonly dragDelta: Readonly<{ x: number; y: number }>
  readonly panDelta: Readonly<{ x: number; y: number }>
  readonly longFrameThresholdMs: number
}

export const LEAFER_ZOOM_OUT_PROBE_WORKLOAD: LeaferZoomOutProbeWorkload
