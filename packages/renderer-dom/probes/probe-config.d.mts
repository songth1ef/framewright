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

export type ScaleConnectionPattern = 'none' | 'many-to-many'

export interface DomScaleProbeScenario {
  readonly id: string
  readonly label: string
  readonly nodeCount: number
  readonly connectionPattern: ScaleConnectionPattern
  readonly initialScale?: number
}

export interface DomScaleProbeWorkload {
  readonly renderer: string
  readonly scenarios: readonly DomScaleProbeScenario[]
  readonly seed: 7
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
  readonly panDelta: Readonly<{ x: number; y: number }>
  readonly longFrameThresholdMs: number
}

export const DOM_SCALE_PROBE_WORKLOAD: DomScaleProbeWorkload

export interface DomZoomOutProbeWorkload {
  readonly renderer: string
  readonly scenarios: readonly (DomScaleProbeScenario & { readonly initialScale: number })[]
  readonly seed: 7
  readonly sampleWindowMs: number
  readonly repeatCount: number
  readonly repeatCooldownMs: number
  readonly caseTimeoutMs: number
  readonly viewport: DomScaleProbeWorkload['viewport']
  readonly viewportRole: string
  readonly dragDelta: Readonly<{ x: number; y: number }>
  readonly panDelta: Readonly<{ x: number; y: number }>
  readonly longFrameThresholdMs: number
}

export const DOM_ZOOM_OUT_PROBE_WORKLOAD: DomZoomOutProbeWorkload
