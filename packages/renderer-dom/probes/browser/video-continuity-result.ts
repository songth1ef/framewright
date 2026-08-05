export interface PlaybackSnapshot {
  elementId: number
  currentTime: number
  paused: boolean
  ended: boolean
  readyState: number
  totalVideoFrames: number
}

export interface VideoContinuityObservations {
  before: PlaybackSnapshot
  immediateAfterRemount: PlaybackSnapshot
  afterPlayReady: PlaybackSnapshot | null
  afterPlaybackProgress: PlaybackSnapshot | null
  playError: string | null
}

export interface VideoContinuityClassification {
  elementRecreated: boolean
  sessionCurrentTimePreserved: boolean
  sessionPausedStatePreserved: boolean
  sessionDecodedFrameCounterPreserved: boolean
  playCallSucceeded: boolean
  mediaBecameReadyAfterPlay: boolean
  playbackAdvancedAfterPlay: boolean
  decodedFramesAdvancedAfterPlay: boolean
  newElementReloadedAndPlayed: boolean
}

const CURRENT_TIME_TOLERANCE_SECONDS = 0.05
const PLAYBACK_ADVANCE_SECONDS = 0.02
const HAVE_CURRENT_DATA = 2

export function classifyVideoContinuity(
  observations: VideoContinuityObservations,
): VideoContinuityClassification {
  const {
    before,
    immediateAfterRemount,
    afterPlayReady,
    afterPlaybackProgress,
    playError,
  } = observations
  const playbackBaseline = afterPlayReady ?? immediateAfterRemount
  const playCallSucceeded = playError === null
  const mediaBecameReadyAfterPlay =
    afterPlayReady !== null && afterPlayReady.readyState >= HAVE_CURRENT_DATA
  const playbackAdvancedAfterPlay =
    afterPlaybackProgress !== null &&
    !afterPlaybackProgress.paused &&
    afterPlaybackProgress.currentTime >= playbackBaseline.currentTime + PLAYBACK_ADVANCE_SECONDS
  const decodedFramesAdvancedAfterPlay =
    afterPlaybackProgress !== null &&
    afterPlaybackProgress.totalVideoFrames > playbackBaseline.totalVideoFrames

  return {
    elementRecreated: immediateAfterRemount.elementId !== before.elementId,
    sessionCurrentTimePreserved:
      (afterPlayReady ?? immediateAfterRemount).currentTime >=
      before.currentTime - CURRENT_TIME_TOLERANCE_SECONDS,
    sessionPausedStatePreserved: immediateAfterRemount.paused === before.paused,
    sessionDecodedFrameCounterPreserved:
      immediateAfterRemount.totalVideoFrames >= before.totalVideoFrames,
    playCallSucceeded,
    mediaBecameReadyAfterPlay,
    playbackAdvancedAfterPlay,
    decodedFramesAdvancedAfterPlay,
    newElementReloadedAndPlayed:
      playCallSucceeded &&
      mediaBecameReadyAfterPlay &&
      playbackAdvancedAfterPlay &&
      decodedFramesAdvancedAfterPlay,
  }
}
