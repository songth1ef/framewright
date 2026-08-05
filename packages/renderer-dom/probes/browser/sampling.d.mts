export interface PlaybackSnapshot {
  fwId: string
  currentTime: number
  totalVideoFrames: number
  droppedVideoFrames: number
  readyState: number
  paused: boolean
}

export interface PlaybackWorkEvidence {
  fwId: string
  progressStartSeconds: number
  progressEndSeconds: number
  progressDeltaSeconds: number
  progressNonZero: true
  decodedFramesStart: number
  decodedFramesEnd: number
  decodedFramesDelta: number
  decodedFramesIncreased: true
  droppedFramesStart: number
  droppedFramesEnd: number
  droppedFramesDelta: number
}

export function assertPlaybackStarted(
  beforePlay: readonly PlaybackSnapshot[],
  afterPlay: readonly PlaybackSnapshot[],
): void

export function buildWorkEvidence(
  sampleStart: readonly PlaybackSnapshot[],
  sampleEnd: readonly PlaybackSnapshot[],
): PlaybackWorkEvidence[]
