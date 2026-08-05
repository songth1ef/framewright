import {
  NOOP_RENDERER_CALLBACKS,
  createFrameNode,
  createVideoNode,
  type FrameNode,
  type RenderContext,
  type RendererAdapter,
  type Viewport,
} from '@framewright/core'
import { createReactFlowProbeRenderer } from '../../src/index'
import { REACT_FLOW_VIDEO_WORKLOAD } from '../probe-config.mjs'
import { buildFrameStats, type FrameStats } from './sampling.mjs'

interface VideoSnapshot {
  fwId: string
  paused: boolean
  currentTime: number
  totalVideoFrames: number
  droppedVideoFrames: number
}

interface VideoProbe {
  mount(count: number): Promise<{ renderMs: number; mountedVideos: number; mountedDomElements: number }>
  playAll(): Promise<void>
  waitForProgress(): Promise<void>
  snapshot(): VideoSnapshot[]
  sampleFps(ms: number, threshold: number): Promise<FrameStats>
  measureCullingReset(): Promise<Record<string, unknown>>
  destroy(): void
}

declare global { interface Window { __reactFlowVideoProbe: VideoProbe } }

const workload = REACT_FLOW_VIDEO_WORKLOAD
const view = document.getElementById('view')
if (view === null) throw new Error('缺少 #view')
let renderer: RendererAdapter | null = null
let root: FrameNode | null = null
let viewport: Viewport = { scale: 1, offsetX: 0, offsetY: 0 }

function context(): RenderContext {
  if (root === null) throw new Error('尚未挂载 video fixture')
  return { root, viewport, selection: [], callbacks: NOOP_RENDERER_CALLBACKS }
}

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

function videos(): HTMLVideoElement[] {
  return Array.from(view.querySelectorAll<HTMLVideoElement>('video[data-probe-video]'))
}

async function waitForVideoCount(count: number): Promise<void> {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    await nextFrame()
    if (videos().length === count) return
  }
  throw new Error(`等待 ${count} 个 video 超时，实际 ${videos().length}`)
}

function buildRoot(count: number): FrameNode {
  return createFrameNode({
    fwId: 'video-probe-root',
    width: workload.viewport.viewWidth,
    height: workload.viewport.viewHeight,
    children: Array.from({ length: count }, (_, index) => createVideoNode({
      fwId: `video-${index}`,
      x: (index % 2) * (workload.nodeSize.width + 20),
      y: Math.floor(index / 2) * (workload.nodeSize.height + 20),
      width: workload.nodeSize.width,
      height: workload.nodeSize.height,
      src: '/video.webm',
      fit: 'cover',
    })),
  })
}

async function mount(count: number): Promise<{ renderMs: number; mountedVideos: number; mountedDomElements: number }> {
  renderer?.destroy()
  view.replaceChildren()
  root = buildRoot(count)
  viewport = { scale: 1, offsetX: 0, offsetY: 0 }
  renderer = createReactFlowProbeRenderer()
  const start = performance.now()
  renderer.mount(view, context())
  await waitForVideoCount(count)
  return { renderMs: performance.now() - start, mountedVideos: videos().length, mountedDomElements: view.querySelectorAll('*').length }
}

async function playAll(): Promise<void> {
  await Promise.all(videos().map((video) => video.play()))
}

function snapshot(): VideoSnapshot[] {
  return videos().map((video) => {
    const quality = video.getVideoPlaybackQuality()
    return {
      fwId: video.closest<HTMLElement>('[data-fw-id]')?.dataset.fwId ?? 'unknown',
      paused: video.paused,
      currentTime: video.currentTime,
      totalVideoFrames: quality.totalVideoFrames,
      droppedVideoFrames: quality.droppedVideoFrames,
    }
  })
}

async function waitForProgress(): Promise<void> {
  const baseline = snapshot()
  for (let attempt = 0; attempt < 300; attempt += 1) {
    await nextFrame()
    const current = snapshot()
    if (current.length === baseline.length && current.every((item, index) => (
      item.currentTime > (baseline[index]?.currentTime ?? 0) &&
      item.totalVideoFrames > (baseline[index]?.totalVideoFrames ?? 0)
    ))) return
  }
  throw new Error('video 未产生播放进度与解码帧')
}

function sampleFps(ms: number, threshold: number): Promise<FrameStats> {
  return new Promise((resolve) => {
    const durations: number[] = []
    let start = 0
    let previous = 0
    const tick = (now: number): void => {
      durations.push(now - previous)
      previous = now
      if (now - start < ms) requestAnimationFrame(tick)
      else resolve(buildFrameStats(durations, threshold))
    }
    requestAnimationFrame((now) => {
      start = now
      previous = now
      requestAnimationFrame(tick)
    })
  })
}

async function measureCullingReset(): Promise<Record<string, unknown>> {
  await mount(1)
  await playAll()
  await waitForProgress()
  const before = snapshot()[0]
  viewport = { scale: 1, offsetX: -100000, offsetY: -100000 }
  renderer?.update(context())
  await waitForVideoCount(0)
  viewport = { scale: 1, offsetX: 0, offsetY: 0 }
  renderer?.update(context())
  await waitForVideoCount(1)
  const after = snapshot()[0]
  if (before === undefined || after === undefined) throw new Error('culling reset 快照缺失')
  return {
    before,
    after,
    unmountedOffscreen: true,
    playbackPositionReset: after.currentTime < before.currentTime,
  }
}

window.__reactFlowVideoProbe = {
  mount,
  playAll,
  waitForProgress,
  snapshot,
  sampleFps,
  measureCullingReset,
  destroy: () => {
    renderer?.destroy()
    renderer = null
    root = null
  },
}
