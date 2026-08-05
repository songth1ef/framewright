import { Leafer, PointerEvent, type IUI } from 'leafer-ui'
import { createVideoNode } from '@framewright/core'
import { layoutVideoControls, hitTestVideoControls } from '../../src/video/player-controls'
import { getOrCreateVideoSource, setVideoElementFactoryForTest } from '../../src/video/video-paint'
import { createVideoShape } from '../../src/video/video-node'

/**
 * 真实浏览器视频 probe 页面（C3-leafer 实测）。
 * 不起 dev server：由 probes/run-video.mjs 用 Playwright page.route 静态伺服。
 * 页面把测量 API 挂到 window.__probe，runner 通过 evaluate 驱动与读数。
 */

interface ProbeNode {
  fwId: string
  url: string
  x: number
  y: number
  width: number
  height: number
  ui: IUI
}

declare global {
  interface Window {
    __probe: Record<string, unknown>
    __taps: unknown[]
  }
}

// --- 仪器化：元素工厂打序号 + 全局 TAP 监听（回答「事件坐标是什么语义」「element 是否被重建」） ---
let elementSeq = 0
const elementIds = new WeakMap<object, number>()
setVideoElementFactoryForTest((url) => {
  const el = document.createElement('video')
  el.preload = 'auto'
  el.playsInline = true
  el.src = url
  elementSeq += 1
  elementIds.set(el, elementSeq)
  return el
})
window.__taps = []

const view = document.getElementById('view')!
const leafer = new Leafer({ view, width: 960, height: 600 })
leafer.on(PointerEvent.TAP, (event) => {
  const target = event.target as IUI | undefined
  window.__taps.push({
    x: event.x,
    y: event.y,
    targetTag: target?.tag ?? null,
    targetData: (target?.data as Record<string, unknown> | undefined) ?? null,
    innerPoint: event.getInnerPoint?.() ?? null,
  })
})
const factory = createVideoShape()
const nodes: ProbeNode[] = []

function createNode(url: string, x: number, y: number, width: number, height: number): string {
  const fwId = `probe-video-${nodes.length}`
  const node = createVideoNode({ fwId, x: 0, y: 0, width, height, src: url, poster: null, fit: 'contain' })
  const ui = factory({ node, position: { x, y }, selected: false })
  ui.data = { fwId }
  leafer.add(ui)
  nodes.push({ fwId, url, x, y, width, height, ui })
  return fwId
}

function sourceState(url: string) {
  const source = getOrCreateVideoSource(url)
  return {
    state: source.state,
    currentTime: source.currentTime,
    duration: source.duration,
    volume: source.element?.volume ?? null,
    playing: source.playing,
    naturalSize: source.naturalSize,
  }
}

/** 控件在页面坐标系中的位置（真实点击 = 真实命中路径，不是直接调函数） */
function controlPoint(fwId: string, kind: 'play' | 'progress50' | 'volume25'): { x: number; y: number } {
  const node = nodes.find((item) => item.fwId === fwId)
  if (!node) throw new Error(`no node ${fwId}`)
  const layout = layoutVideoControls(node.width, node.height)
  const viewRect = view.getBoundingClientRect()
  const scale = leafer.scale ?? 1
  const toPage = (lx: number, ly: number) => ({
    x: viewRect.left + (node.x + lx) * scale + (leafer.x ?? 0),
    y: viewRect.top + (node.y + ly) * scale + (leafer.y ?? 0),
  })
  switch (kind) {
    case 'play':
      return toPage(layout.playButton.x + layout.playButton.width / 2, layout.playButton.y + layout.playButton.height / 2)
    case 'progress50':
      return toPage(layout.progressTrack.x + layout.progressTrack.width / 2, layout.progressTrack.y + layout.progressTrack.height / 2)
    case 'volume25':
      return toPage(layout.volumeTrack.x + layout.volumeTrack.width / 4, layout.volumeTrack.y + layout.volumeTrack.height / 2)
  }
}

/** 采样 FPS：返回帧数、耗时、长帧（>50ms）数 */
function sampleFps(ms: number): Promise<{ frames: number; elapsedMs: number; fps: number; longFrames: number }> {
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

/** 画面指纹：view 下所有 canvas 各算一个（命中画布可能不止一张，返回数组） */
function frameFingerprint(fwId: string): number[] {
  const node = nodes.find((item) => item.fwId === fwId)
  if (!node) throw new Error(`no node ${fwId}`)
  const out: number[] = []
  for (const canvas of Array.from(view.querySelectorAll('canvas'))) {
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      out.push(-1)
      continue
    }
    const cx = Math.floor(node.x + node.width / 2)
    const cy = Math.floor(node.y + node.height / 3)
    const data = ctx.getImageData(cx - 8, cy - 8, 16, 16).data
    let hash = 0
    for (let i = 0; i < data.length; i += 7) hash = (hash * 31 + data[i]!) | 0
    out.push(hash)
  }
  return out
}

/** 诊断：两种坐标语义各自过一遍 hitTest + element 序号（检测 source 被重建） */
function diagnoseTap(fwId: string, pageX: number, pageY: number) {
  const node = nodes.find((item) => item.fwId === fwId)
  if (!node) throw new Error(`no node ${fwId}`)
  const layout = layoutVideoControls(node.width, node.height)
  const source = getOrCreateVideoSource(node.url)
  const viewRect = view.getBoundingClientRect()
  const inView = { x: pageX - viewRect.left, y: pageY - viewRect.top }
  const inContainer = { x: inView.x - node.x, y: inView.y - node.y }
  const el = source.element
  return {
    layoutBar: layout.bar,
    layoutProgress: layout.progressTrack,
    hitByContainerLocal: hitTestVideoControls(layout, inContainer),
    hitByViewLocal: hitTestVideoControls(layout, inView),
    elementId: el ? elementIds.get(el as unknown as object) ?? null : null,
    source: {
      state: source.state,
      currentTime: source.currentTime,
      duration: source.duration,
      rawDuration: el?.duration,
      playing: source.playing,
    },
  }
}

/** 控件在页面坐标系中的位置（真实点击 = 真实命中路径，不是直接调函数） */

function memoryMB(): number | null {
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
  return memory ? Math.round((memory.usedJSHeapSize / 1024 / 1024) * 10) / 10 : null
}

window.__probe = { createNode, sourceState, controlPoint, sampleFps, frameFingerprint, memoryMB, diagnoseTap }
