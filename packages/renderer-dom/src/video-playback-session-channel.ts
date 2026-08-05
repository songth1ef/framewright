import type { RendererCallbacks } from '@framewright/core'

export interface VideoPlaybackSessionState {
  src: string
  currentTime: number
  paused: boolean
}

export type VideoPlaybackSessionAction =
  | { kind: 'read' }
  | { kind: 'write'; state: VideoPlaybackSessionState }

const READ_ACTION = 'video-playback-session:read'
const WRITE_ACTION_PREFIX = 'video-playback-session:write:'

function isPlaybackState(value: unknown): value is VideoPlaybackSessionState {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<VideoPlaybackSessionState>
  return (
    typeof candidate.src === 'string' &&
    typeof candidate.currentTime === 'number' &&
    Number.isFinite(candidate.currentTime) &&
    typeof candidate.paused === 'boolean'
  )
}

export function createVideoPlaybackSessionWriteAction(state: VideoPlaybackSessionState): string {
  return `${WRITE_ACTION_PREFIX}${JSON.stringify(state)}`
}

export function parseVideoPlaybackSessionAction(
  action: string,
): VideoPlaybackSessionAction | null {
  if (action === READ_ACTION) return { kind: 'read' }
  if (!action.startsWith(WRITE_ACTION_PREFIX)) return null

  try {
    const state: unknown = JSON.parse(action.slice(WRITE_ACTION_PREFIX.length))
    return isPlaybackState(state) ? { kind: 'write', state } : null
  } catch {
    return null
  }
}

export function readVideoPlaybackSessionState(
  onNodeAction: RendererCallbacks['onNodeAction'],
  fwId: string,
): VideoPlaybackSessionState | undefined {
  const response: unknown = (
    onNodeAction as (fwId: string, action: string) => unknown
  )(fwId, READ_ACTION)
  return isPlaybackState(response) ? response : undefined
}

export function reportVideoPlaybackSessionState(
  onNodeAction: RendererCallbacks['onNodeAction'],
  fwId: string,
  state: VideoPlaybackSessionState,
): void {
  onNodeAction(fwId, createVideoPlaybackSessionWriteAction(state))
}
