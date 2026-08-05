import {
  parseVideoPlaybackSessionAction,
  type VideoPlaybackSessionState,
} from '@framewright/renderer-dom'

export interface VideoPlaybackSessionActionResult {
  handled: boolean
  response?: VideoPlaybackSessionState
}

export interface VideoPlaybackSessionStore {
  clear(): void
  handleAction(fwId: string, action: string): VideoPlaybackSessionActionResult
}

export function createVideoPlaybackSessionStore(): VideoPlaybackSessionStore {
  const sessions = new Map<string, VideoPlaybackSessionState>()

  return {
    clear() {
      sessions.clear()
    },
    handleAction(fwId, action) {
      const message = parseVideoPlaybackSessionAction(action)
      if (message === null) return { handled: false }
      if (message.kind === 'read') {
        const response = sessions.get(fwId)
        return response === undefined ? { handled: true } : { handled: true, response }
      }
      sessions.set(fwId, message.state)
      return { handled: true }
    },
  }
}
