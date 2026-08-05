import type { RendererCallbacks } from '@framewright/core'
import { useLayoutEffect, useRef, type RefObject } from 'react'

interface VideoPlaybackState {
  src: string
  currentTime: number
  paused: boolean
}

type PlaybackHost = RendererCallbacks['onNodeAction']

const sessionsByHost = new WeakMap<PlaybackHost, Map<string, VideoPlaybackState>>()

function getHostSessions(host: PlaybackHost): Map<string, VideoPlaybackState> {
  const existing = sessionsByHost.get(host)
  if (existing !== undefined) return existing

  const sessions = new Map<string, VideoPlaybackState>()
  sessionsByHost.set(host, sessions)
  return sessions
}

/**
 * 视频元素可以随裁剪销毁；播放位置与暂停态则借 host 的稳定回调身份跨 adapter 保留。
 * 后续 host 接线只需把这里的读写通道替换成显式会话状态，不需要保留媒体元素。
 */
export function useVideoPlaybackSession(
  fwId: string,
  src: string,
  host: PlaybackHost,
): RefObject<HTMLVideoElement | null> {
  const videoRef = useRef<HTMLVideoElement>(null)

  useLayoutEffect(() => {
    const video = videoRef.current
    if (video === null) return

    const sessions = getHostSessions(host)
    const saved = sessions.get(fwId)

    const save = (): void => {
      if (!Number.isFinite(video.currentTime)) return
      sessions.set(fwId, {
        src,
        currentTime: video.currentTime,
        paused: video.paused,
      })
    }

    video.addEventListener('play', save)
    video.addEventListener('pause', save)
    video.addEventListener('timeupdate', save)

    if (saved?.src === src) {
      video.currentTime = saved.currentTime
      if (saved.paused && !video.paused) {
        video.pause()
      } else if (!saved.paused) {
        void video.play().catch(() => undefined)
      }
    }

    return () => {
      save()
      video.removeEventListener('play', save)
      video.removeEventListener('pause', save)
      video.removeEventListener('timeupdate', save)
    }
  }, [fwId, host, src])

  return videoRef
}
