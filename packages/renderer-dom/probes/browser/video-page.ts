import type { PlaybackSnapshot } from './sampling.mjs'

/**
 * DOM 视频浏览器探针页面。
 * runner 用 Playwright page.route 静态伺服，不启动任何 dev server。
 */

interface FpsSample {
  frames: number
  elapsedMs: number
  fps: number
  longFrames: number
}

interface DomVideoProbe {
  ensureVideos(count: number): void
  waitUntilReady(count: number): Promise<void>
  playAll(count: number): Promise<void>
  pauseAll(): void
  snapshot(count: number): PlaybackSnapshot[]
  sampleFps(ms: number): Promise<FpsSample>
}

declare global {
  interface Window {
    __probe: DomVideoProbe
  }
}

function requireView(): HTMLElement {
  const element = document.getElementById('view')
  if (element === null) throw new Error('缺少 #view')
  return element
}

const view = requireView()

const videos: HTMLVideoElement[] = []

function ensureVideos(count: number): void {
  while (videos.length < count) {
    const index = videos.length
    const video = document.createElement('video')
    video.dataset.fwId = `probe-video-${index}`
    video.src = `/video.webm?i=${index + 1}`
    video.controls = true
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.style.position = 'absolute'
    video.style.left = `${20 + (index % 2) * 500}px`
    video.style.top = `${20 + Math.floor(index / 2) * 300}px`
    video.style.width = '460px'
    video.style.height = '260px'
    video.style.objectFit = 'contain'
    video.style.background = '#111'
    view.append(video)
    videos.push(video)
    video.load()
  }
}

async function waitUntilReady(count: number): Promise<void> {
  await Promise.all(
    videos.slice(0, count).map((video) => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve()
      return new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error(`${video.dataset.fwId} 加载超时`)), 20_000)
        video.addEventListener(
          'loadeddata',
          () => {
            window.clearTimeout(timeout)
            resolve()
          },
          { once: true },
        )
      })
    }),
  )
}

async function playAll(count: number): Promise<void> {
  await Promise.all(videos.slice(0, count).map((video) => video.play()))
}

function pauseAll(): void {
  for (const video of videos) video.pause()
}

function snapshot(count: number): PlaybackSnapshot[] {
  return videos.slice(0, count).map((video, index) => {
    const quality = video.getVideoPlaybackQuality()
    return {
      fwId: video.dataset.fwId ?? `probe-video-${index}`,
      currentTime: video.currentTime,
      totalVideoFrames: quality.totalVideoFrames,
      droppedVideoFrames: quality.droppedVideoFrames,
      readyState: video.readyState,
      paused: video.paused,
    }
  })
}

function sampleFps(ms: number): Promise<FpsSample> {
  return new Promise((resolve) => {
    let frames = 0
    let longFrames = 0
    let last = performance.now()
    const start = last
    const tick = (now: number) => {
      frames += 1
      if (now - last > 50) longFrames += 1
      last = now
      if (now - start < ms) requestAnimationFrame(tick)
      else resolve({ frames, elapsedMs: now - start, fps: (frames / (now - start)) * 1000, longFrames })
    }
    requestAnimationFrame(tick)
  })
}

window.__probe = { ensureVideos, waitUntilReady, playAll, pauseAll, snapshot, sampleFps }
