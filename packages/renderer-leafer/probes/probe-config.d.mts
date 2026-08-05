export type ScaleConnectionPattern = 'none' | 'many-to-many'

export interface LeaferScaleProbeScenario {
  readonly id: string
  readonly label: string
  readonly nodeCount: number
  readonly connectionPattern: ScaleConnectionPattern
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
