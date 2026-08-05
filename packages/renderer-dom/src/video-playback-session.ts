import type { RendererCallbacks } from '@framewright/core'
import { useLayoutEffect, useRef, type RefObject } from 'react'
import {
  readVideoPlaybackSessionState,
  reportVideoPlaybackSessionState,
} from './video-playback-session-channel'

const TIMEUPDATE_REPORT_INTERVAL_MS = 1_000

/**
 * 视频元素可以随裁剪销毁；播放位置与暂停态经既有 onNodeAction 通道交给 host 保留。
 */
export function useVideoPlaybackSession(
  fwId: string,
  src: string,
  onNodeAction: RendererCallbacks['onNodeAction'],
): RefObject<HTMLVideoElement | null> {
  const videoRef = useRef<HTMLVideoElement>(null)

  useLayoutEffect(() => {
    const video = videoRef.current
    if (video === null) return

    const saved = readVideoPlaybackSessionState(onNodeAction, fwId)
    let lastTimeupdateReportAt = Number.NEGATIVE_INFINITY

    const report = (): void => {
      if (!Number.isFinite(video.currentTime)) return
      reportVideoPlaybackSessionState(onNodeAction, fwId, {
        src,
        currentTime: video.currentTime,
        paused: video.paused,
      })
    }

    const reportTimeupdate = (): void => {
      const now = performance.now()
      if (now - lastTimeupdateReportAt < TIMEUPDATE_REPORT_INTERVAL_MS) return
      lastTimeupdateReportAt = now
      report()
    }

    video.addEventListener('play', report)
    video.addEventListener('pause', report)
    video.addEventListener('timeupdate', reportTimeupdate)

    if (saved?.src === src) {
      video.currentTime = saved.currentTime
      if (saved.paused && !video.paused) {
        video.pause()
      } else if (!saved.paused) {
        void video.play().catch(() => undefined)
      }
    }

    return () => {
      report()
      video.removeEventListener('play', report)
      video.removeEventListener('pause', report)
      video.removeEventListener('timeupdate', reportTimeupdate)
    }
  }, [fwId, onNodeAction, src])

  return videoRef
}
