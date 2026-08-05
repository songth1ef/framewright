export const FPS_DISPLAY_INTERVAL_MS = 300
const FPS_SAMPLE_WINDOW_MS = 3_000
const LONG_FRAME_THRESHOLD_MS = 50
export const FPS_MONITOR_STORAGE_KEY = 'framewright:fps-monitor-enabled'

export interface FpsSample {
  fps: number
  minimumFps: number
  longFrames: number
}

interface FpsSampler {
  recordFrame(timestamp: number): void
}

interface StorageReader {
  getItem(key: string): string | null
}

export function readFpsMonitorPreference(storage: StorageReader | null): boolean {
  if (storage === null) return false
  try {
    return storage.getItem(FPS_MONITOR_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * rAF 每帧只做数字计数；昂贵得多的 DOM 文本写入最多每 300ms 一次。
 * 最近窗口同时保留最低 FPS 与长帧数，避免平均值掩盖瞬时卡顿。
 */
export function createFpsSampler(onDisplay: (sample: FpsSample) => void): FpsSampler {
  let previousFrameAt: number | null = null
  let displayWindowStartedAt: number | null = null
  let framesSinceDisplay = 0
  const recentFps: Array<{ timestamp: number; fps: number }> = []
  const longFrameTimestamps: number[] = []

  return {
    recordFrame(timestamp) {
      if (previousFrameAt === null || displayWindowStartedAt === null) {
        previousFrameAt = timestamp
        displayWindowStartedAt = timestamp
        return
      }

      const frameDuration = timestamp - previousFrameAt
      previousFrameAt = timestamp
      framesSinceDisplay += 1
      if (frameDuration >= LONG_FRAME_THRESHOLD_MS) longFrameTimestamps.push(timestamp)

      const elapsed = timestamp - displayWindowStartedAt
      if (elapsed < FPS_DISPLAY_INTERVAL_MS) return

      const cutoff = timestamp - FPS_SAMPLE_WINDOW_MS
      while (recentFps[0] !== undefined && recentFps[0].timestamp < cutoff) recentFps.shift()
      while (longFrameTimestamps[0] !== undefined && longFrameTimestamps[0] < cutoff) {
        longFrameTimestamps.shift()
      }

      const fps = Math.round((framesSinceDisplay * 1_000) / elapsed)
      recentFps.push({ timestamp, fps })
      onDisplay({
        fps,
        minimumFps: Math.min(...recentFps.map((sample) => sample.fps)),
        longFrames: longFrameTimestamps.length,
      })
      framesSinceDisplay = 0
      displayWindowStartedAt = timestamp
    },
  }
}
