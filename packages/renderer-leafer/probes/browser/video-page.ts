import { Leafer, PointerEvent, type IUI } from 'leafer-ui'
import { createVideoNode } from '@framewright/core'
import { layoutVideoControls, hitTestVideoControls } from '../../src/video/player-controls'
import { getOrCreateVideoSource, setVideoElementFactoryForTest } from '../../src/video/video-paint'
import { createVideoShape } from '../../src/video/video-node'
import type { PlaybackSnapshot } from './sampling.mjs'

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
    __tapDebug: unknown[]
    __videoEvents: unknown[]
  }
}

// --- 仪器化①：元素工厂打序号 + 元素生命周期事件日志 ---
// 回答「element 是否被重建 / 被 dispose（src 清空会触发 emptied）」「seek 事件序列」
let elementSeq = 0
const elementIds = new WeakMap<object, number>()
window.__videoEvents = []
setVideoElementFactoryForTest((url) => {
  const el = document.createElement('video')
  el.preload = 'auto'
  el.playsInline = true
  el.muted = true
  el.src = url
  elementSeq += 1
  elementIds.set(el, elementSeq)
  const seq = elementSeq
  window.__videoEvents.push({ kind: 'create', seq, url })
  for (const type of ['loadeddata', 'seeking', 'seeked', 'emptied', 'abort', 'error', 'play', 'pause']) {
    el.addEventListener(type, () => {
      window.__videoEvents.push({ kind: type, seq, currentTime: el.currentTime, src: el.src.slice(-30) })
    })
  }
  return el
})
window.__taps = []
window.__tapDebug = []

// --- 仪器化②：drawImage 合成计数 ---
// 回答「视频帧有没有真的被画进 canvas」——总数 vs 以 video 元素为源的次数
let drawImageCalls = 0
let drawImageVideoCalls = 0
const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage
CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, ...args: unknown[]): void {
  drawImageCalls += 1
  if (args[0] instanceof HTMLVideoElement) drawImageVideoCalls += 1
  ;(originalDrawImage as (...a: unknown[]) => void).apply(this, args)
} as typeof CanvasRenderingContext2D.prototype.drawImage

const view = document.getElementById('view')!
// 视图加高到 1300：8 路并发节点的 y 到 920+260=1180，首轮 600 高把 5~8 路放出了视图外（点击落空、只有 4 路在走）
const leafer = new Leafer({ view, width: 960, height: 1300 })
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
  // 仪器化③：与真实 handler 同一个事件对象，记录它看到的坐标（容器内坐标 + 原始 x/y）
  ui.on(PointerEvent.TAP, (event) => {
    window.__tapDebug.push({
      fwId,
      eventXY: [event.x, event.y],
      innerToContainer: event.getInnerPoint?.(ui) ?? null,
      target: (event.target as IUI | undefined)?.tag ?? null,
    })
  })
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

function resetPlayback(url: string): void {
  const element = getOrCreateVideoSource(url).element
  if (element === null) throw new Error(`视频源尚未就绪：${url}`)
  element.pause()
  element.currentTime = 0
}

function snapshot(urls: string[]): PlaybackSnapshot[] {
  return urls.map((url, index) => {
    const source = getOrCreateVideoSource(url)
    const element = source.element
    const quality = element?.getVideoPlaybackQuality()
    return {
      fwId: nodes[index]?.fwId ?? `probe-video-${index}`,
      currentTime: source.currentTime,
      totalVideoFrames: quality?.totalVideoFrames ?? 0,
      droppedVideoFrames: quality?.droppedVideoFrames ?? 0,
      readyState: element?.readyState ?? 0,
      paused: element?.paused ?? true,
    }
  })
}

/** 控件在页面坐标系中的位置（真实点击 = 真实命中路径，不是直接调函数） */
function controlPoint(fwId: string, kind: 'play' | 'progress50' | 'progress90' | 'volume25'): { x: number; y: number } {
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
    case 'progress90':
      return toPage(layout.progressTrack.x + layout.progressTrack.width * 0.9, layout.progressTrack.y + layout.progressTrack.height / 2)
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

/** 画面指纹：网格采样 5×3 个 8×8 色块（覆盖视频区、避开底部控制条），任一色块变化即算变化。
 *  教训：单点采样可能落在静态像素上（深色录屏的大片静态区域），「指纹不变」≠「画面没更新」 */
function frameFingerprint(fwId: string): number[][] {
  const node = nodes.find((item) => item.fwId === fwId)
  if (!node) throw new Error(`no node ${fwId}`)
  const points: Array<[number, number]> = []
  for (let gx = 0; gx < 5; gx++) {
    for (let gy = 0; gy < 3; gy++) {
      points.push([
        Math.floor(node.x + node.width * (0.1 + 0.2 * gx)),
        Math.floor(node.y + node.height * (0.08 + 0.25 * gy)),
      ])
    }
  }
  const out: number[][] = []
  for (const canvas of Array.from(view.querySelectorAll('canvas'))) {
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      out.push([-1])
      continue
    }
    const hashes: number[] = []
    for (const [cx, cy] of points) {
      const data = ctx.getImageData(cx - 4, cy - 4, 8, 8).data
      let hash = 0
      for (let i = 0; i < data.length; i += 7) hash = (hash * 31 + data[i]!) | 0
      hashes.push(hash)
    }
    out.push(hashes)
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
    // 注：layout 本来就是容器坐标系，view 坐标不过换算直接命中是「应该不命中」——
    // 首轮 probe 曾把 hitByViewLocal=null 当成坐标空间错位的证据，实属误导，故移除该对照
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

/** 诊断：paint 管线内部状态——fill 有没有算出 leafPaint、image 是否 ready、data/pattern 是否存在 */
function paintState(fwId: string) {
  const node = nodes.find((item) => item.fwId === fwId)
  if (!node) throw new Error(`no node ${fwId}`)
  const screen = (node.ui as unknown as { children: IUI[] }).children[0] as IUI & {
    __: Record<string, unknown>
  }
  const data = screen.__ as unknown as Record<string, unknown>
  const fills = (data['_fill'] as Array<Record<string, unknown>> | undefined) ?? null
  return {
    inputFill: data['__input'] ? (data['__input'] as Record<string, unknown>)['fill'] : null,
    leafPaints: fills?.map((item) => {
      const image = item['image'] as
        | { ready?: boolean; url?: string; width?: number; height?: number; view?: unknown; error?: unknown }
        | undefined
      return {
        type: item['type'],
        imageReady: image?.ready ?? null,
        imageUrl: image?.url ?? null,
        imageSize: image ? [image.width ?? null, image.height ?? null] : null,
        imageViewTag:
          image?.view instanceof HTMLVideoElement
            ? 'HTMLVideoElement'
            : image?.view === null || image?.view === undefined
              ? null
              : Object.getPrototypeOf(image.view)?.constructor?.name ?? typeof image?.view,
        imageError: image?.error ? String(image.error) : null,
        hasData: item['data'] != null,
        patternId: (item['patternId'] as string | undefined) ?? null,
      }
    }),
    rendererIgnore: (leafer.renderer as unknown as { ignore?: boolean }).ignore ?? null,
  }
}

/** 诊断：解码证据——getVideoPlaybackQuality 计数（帧真的被解码才会涨） */
function videoQuality(url: string) {
  const el = getOrCreateVideoSource(url).element as HTMLVideoElement | null
  const q = el?.getVideoPlaybackQuality?.()
  return q ? { totalVideoFrames: q.totalVideoFrames, droppedVideoFrames: q.droppedVideoFrames } : null
}

/** 诊断：合成计数快照（可配合清零做区间统计） */
function renderStats(reset = false) {
  const stats = { drawImageCalls, drawImageVideoCalls }
  if (reset) {
    drawImageCalls = 0
    drawImageVideoCalls = 0
  }
  return stats
}

window.__probe = {
  createNode,
  sourceState,
  resetPlayback,
  snapshot,
  controlPoint,
  sampleFps,
  frameFingerprint,
  diagnoseTap,
  paintState,
  videoQuality,
  renderStats,
}
