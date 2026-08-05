import {
  NOOP_RENDERER_CALLBACKS,
  createDemoDocument,
  type RenderContext,
  type RendererAdapter,
  type Viewport,
} from '@framewright/core'
import { createLeaferRenderer } from '../../../renderer-leafer/src/index'
import { createDomRenderer } from '../../src/index'

type RendererId = 'dom' | 'leafer'
type Transition = 'culling' | 'simplified' | 'dot'

interface PlaybackSnapshot {
  elementId: number
  currentTime: number
  paused: boolean
  ended: boolean
  readyState: number
  totalVideoFrames: number
}

export interface VideoContinuityResult {
  renderer: RendererId
  transition: Transition
  before: PlaybackSnapshot
  absentDuringTransition: boolean
  after: PlaybackSnapshot
  currentTimePreserved: boolean
  playbackResumed: boolean
  decodedFrameCounterPreserved: boolean
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

let renderer: RendererAdapter | null = null
let activeRenderer: RendererId | null = null
let viewport: Viewport = { scale: 1, offsetX: 0, offsetY: 0 }
const root = createDemoDocument()

function context(): RenderContext {
  return { root, viewport, selection: [], callbacks: NOOP_RENDERER_CALLBACKS }
}

function findVideo(id: RendererId): HTMLVideoElement | null {
  if (id === 'dom') {
    return view.querySelector('[data-fw-id="video-1"][data-fw-type="video"]')
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
  activeRenderer = id
  viewport = { scale: 1, offsetX: 0, offsetY: 0 }
  renderer = id === 'dom' ? createDomRenderer() : createLeaferRenderer()
  renderer.mount(view, context())
  await waitUntil(() => snapshot(id), `${id} 首次视频挂载`)
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

  viewport = transitionViewport(transition)
  renderer?.update(context())
  await waitUntil(() => findVideo(id) === null ? true : null, `${id}/${transition} 卸载视频`)
  const absentDuringTransition = findVideo(id) === null

  viewport = { scale: 1, offsetX: 0, offsetY: 0 }
  renderer?.update(context())
  const after = await waitUntil(() => {
    const current = snapshot(id)
    return current !== null && current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ? current
      : null
  }, `${id}/${transition} 重建视频`)

  return {
    renderer: id,
    transition,
    before,
    absentDuringTransition,
    after,
    currentTimePreserved: after.currentTime >= before.currentTime - 0.05,
    playbackResumed: !after.paused,
    decodedFrameCounterPreserved: after.totalVideoFrames >= before.totalVideoFrames,
  }
}

function destroy(): void {
  renderer?.destroy()
  renderer = null
  activeRenderer = null
  view.replaceChildren()
}

window.__videoContinuityProbe = { runScenario, destroy }
