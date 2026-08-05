import {
  NOOP_RENDERER_CALLBACKS,
  createDemoDocument,
  type RenderContext,
  type RendererAdapter,
  type Viewport,
} from '@framewright/core'
import { createLeaferRenderer } from '../../../renderer-leafer/src/index'
import { createDomRenderer } from '../../src/index'
import {
  classifyVideoContinuity,
  type PlaybackSnapshot,
  type VideoContinuityClassification,
} from './video-continuity-result'

type RendererId = 'dom' | 'leafer'
type Transition = 'culling' | 'simplified' | 'dot'

export interface VideoContinuityResult {
  renderer: RendererId
  transition: Transition
  before: PlaybackSnapshot
  mediaElementAbsentDuringTransition: boolean
  videoDrawCallsBeforeTransition: number | null
  videoDrawCallsDuringTransition: number | null
  videoContentAbsentDuringTransition: boolean
  immediateAfterRemount: PlaybackSnapshot
  playError: string | null
  afterPlayReady: PlaybackSnapshot | null
  afterPlaybackProgress: PlaybackSnapshot | null
  classification: VideoContinuityClassification
}

interface VideoContinuityProbe {
  runScenario(renderer: RendererId, transition: Transition): Promise<VideoContinuityResult>
  destroy(): void
}

declare global {
  interface Window {
    __videoContinuityProbe: VideoContinuityProbe
  }
}

const view = document.getElementById('view')
if (view === null) throw new Error('缺少 #view')

const trackedVideos: HTMLVideoElement[] = []
const videoIds = new WeakMap<HTMLVideoElement, number>()
const videoDrawCounts = new WeakMap<HTMLVideoElement, number>()
const nativeCreateElement = Document.prototype.createElement
Document.prototype.createElement = function createElement(
  tagName: string,
  options?: ElementCreationOptions,
): HTMLElement {
  const element = nativeCreateElement.call(this, tagName, options) as HTMLElement
  if (tagName.toLowerCase() === 'video') {
    const video = element as HTMLVideoElement
    trackedVideos.push(video)
    videoIds.set(video, trackedVideos.length)
  }
  return element
}

const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage as unknown as (
  this: CanvasRenderingContext2D,
  ...args: unknown[]
) => void
CanvasRenderingContext2D.prototype.drawImage = function drawImage(...args: unknown[]): void {
  const source = args[0]
  if (source instanceof HTMLVideoElement) {
    videoDrawCounts.set(source, (videoDrawCounts.get(source) ?? 0) + 1)
  }
  nativeDrawImage.apply(this, args)
}

let renderer: RendererAdapter | null = null
let viewport: Viewport = { scale: 1, offsetX: 0, offsetY: 0 }
const root = createDemoDocument()

function context(): RenderContext {
  return { root, viewport, selection: [], callbacks: NOOP_RENDERER_CALLBACKS }
}

function findVideo(id: RendererId): HTMLVideoElement | null {
  if (id === 'dom') {
    return view.querySelector('video[data-fw-id="video-1"][data-fw-type="video"]')
  }
  return trackedVideos.findLast((video) => video.src.startsWith('data:video/')) ?? null
}

function snapshot(id: RendererId): PlaybackSnapshot | null {
  const video = findVideo(id)
  if (video === null) return null
  return {
    elementId: videoIds.get(video) ?? -1,
    currentTime: video.currentTime,
    paused: video.paused,
    ended: video.ended,
    readyState: video.readyState,
    totalVideoFrames: video.getVideoPlaybackQuality().totalVideoFrames,
  }
}

function videoDrawCount(id: RendererId): number {
  const video = findVideo(id)
  return video === null ? 0 : videoDrawCounts.get(video) ?? 0
}

function waitAnimationFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const next = (remaining: number): void => {
      if (remaining <= 0) {
        resolve()
        return
      }
      requestAnimationFrame(() => next(remaining - 1))
    }
    next(count)
  })
}

function waitUntil<T>(read: () => T | null, label: string, timeoutMs = 20_000): Promise<T> {
  const startedAt = performance.now()
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      const value = read()
      if (value !== null) {
        resolve(value)
        return
      }
      if (performance.now() - startedAt >= timeoutMs) {
        reject(new Error(`${label} 超时`))
        return
      }
      requestAnimationFrame(tick)
    }
    tick()
  })
}

async function mount(id: RendererId): Promise<void> {
  renderer?.destroy()
  renderer = null
  view.replaceChildren()
  viewport = { scale: 1, offsetX: 0, offsetY: 0 }
  renderer = id === 'dom' ? createDomRenderer() : createLeaferRenderer()
  renderer.mount(view, context())
  await waitUntil(() => snapshot(id), `${id} 首次视频挂载`)
}

async function observeUntil<T>(
  read: () => T | null,
  timeoutMs = 20_000,
): Promise<T | null> {
  const startedAt = performance.now()
  return new Promise((resolve) => {
    const tick = (): void => {
      const value = read()
      if (value !== null || performance.now() - startedAt >= timeoutMs) {
        resolve(value)
        return
      }
      requestAnimationFrame(tick)
    }
    tick()
  })
}

async function beginPlayback(id: RendererId): Promise<PlaybackSnapshot> {
  const video = findVideo(id)
  if (video === null) throw new Error(`${id} 没有可播放 video`)
  video.muted = true
  video.loop = true
  video.playbackRate = 0.1
  await video.play()
  await waitUntil(() =>
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ? true : null,
  `${id} 首次视频加载`)
  video.currentTime = 0.2
  if (video.paused) await video.play()
  return waitUntil(() => {
    const current = snapshot(id)
    return current !== null && !current.paused && current.currentTime >= 0.22 &&
      current.totalVideoFrames > 0
      ? current
      : null
  }, `${id} 播放进度与解码帧增长`)
}

function transitionViewport(transition: Transition): Viewport {
  switch (transition) {
    case 'culling':
      return { scale: 1, offsetX: 0, offsetY: -2_000 }
    case 'simplified':
      return { scale: 0.25, offsetX: 0, offsetY: 0 }
    case 'dot':
      return { scale: 0.1, offsetX: 0, offsetY: 0 }
  }
}

async function runScenario(
  id: RendererId,
  transition: Transition,
): Promise<VideoContinuityResult> {
  await mount(id)
  const before = await beginPlayback(id)
  const videoDrawCallsBeforeTransition = id === 'leafer'
    ? await waitUntil(() => {
        const count = videoDrawCount(id)
        return count > 0 ? count : null
      }, `${id}/${transition} 首次视频帧绘制`)
    : null

  viewport = transitionViewport(transition)
  renderer?.update(context())
  let mediaElementAbsentDuringTransition = false
  let videoDrawCallsDuringTransition: number | null = null
  let videoContentAbsentDuringTransition = false
  if (id === 'dom') {
    await waitUntil(() => findVideo(id) === null ? true : null, `${id}/${transition} 卸载视频`)
    mediaElementAbsentDuringTransition = true
    videoContentAbsentDuringTransition = true
  } else {
    await waitAnimationFrames(4)
    const drawCountAtObservationStart = videoDrawCount(id)
    await new Promise((resolve) => setTimeout(resolve, 250))
    videoDrawCallsDuringTransition = videoDrawCount(id) - drawCountAtObservationStart
    mediaElementAbsentDuringTransition = findVideo(id) === null
    videoContentAbsentDuringTransition = videoDrawCallsDuringTransition === 0
  }

  viewport = { scale: 1, offsetX: 0, offsetY: 0 }
  renderer?.update(context())
  const immediateAfterRemount = snapshot(id) ?? await waitUntil(
      () => snapshot(id),
      `${id}/${transition} 重建视频元素`,
    )

  const remountedVideo = findVideo(id)
  if (remountedVideo === null) throw new Error(`${id}/${transition} 重建后没有 video`)
  remountedVideo.muted = true
  remountedVideo.loop = true
  remountedVideo.playbackRate = 0.1

  let playError: string | null = null
  try {
    await remountedVideo.play()
  } catch (error) {
    playError = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  }

  const afterPlayReady = playError === null
    ? await observeUntil(() => {
        const current = snapshot(id)
        return current !== null && current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
          ? current
          : null
      })
    : null
  const progressBaseline = afterPlayReady ?? immediateAfterRemount
  const afterPlaybackProgress = afterPlayReady === null
    ? null
    : await observeUntil(() => {
        const current = snapshot(id)
        return current !== null &&
          !current.paused &&
          current.currentTime >= progressBaseline.currentTime + 0.02 &&
          current.totalVideoFrames > progressBaseline.totalVideoFrames
          ? current
          : null
      })
  const observations = {
    before,
    immediateAfterRemount,
    playError,
    afterPlayReady,
    afterPlaybackProgress,
  }

  return {
    renderer: id,
    transition,
    before,
    mediaElementAbsentDuringTransition,
    videoDrawCallsBeforeTransition,
    videoDrawCallsDuringTransition,
    videoContentAbsentDuringTransition,
    immediateAfterRemount,
    playError,
    afterPlayReady,
    afterPlaybackProgress,
    classification: classifyVideoContinuity(observations),
  }
}

function destroy(): void {
  renderer?.destroy()
  renderer = null
  view.replaceChildren()
}

window.__videoContinuityProbe = { runScenario, destroy }
