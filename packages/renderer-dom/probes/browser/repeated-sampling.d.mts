export interface DistributionSummary {
  median: number
  q1: number
  q3: number
  iqr: number
}

export interface CompletedS4Sample {
  status: 'completed'
  firstScreen: { elapsedMs: number }
  drag: {
    avgFps: number
    frameTimeMs: { median: number; p95: number; max: number }
    longFrames: number
  }
  pan: {
    avgFps: number
    frameTimeMs: { median: number; p95: number; max: number }
    longFrames: number
  }
  [key: string]: unknown
}

export type S4Sample = CompletedS4Sample | ({ status: string } & Record<string, unknown>)

export function summarizeValues(values: readonly number[]): DistributionSummary
export function aggregateSamples<T extends S4Sample>(samples: readonly T[]): {
  samples: readonly T[]
  completedSampleCount: number
  aggregate: null | {
    firstScreen: { elapsedMs: DistributionSummary }
    drag: PhaseAggregate
    pan: PhaseAggregate
  }
}

export interface PhaseAggregate {
  avgFps: DistributionSummary
  frameTimeMs: {
    median: DistributionSummary
    p95: DistributionSummary
    max: DistributionSummary
  }
  longFrames: DistributionSummary
}
