import { Group, Leafer, Path, Rect, type IUI } from 'leafer-ui'
import {
  LEAFER_SCALE_PROBE_WORKLOAD,
  type LeaferScaleProbeScenario,
} from '../probe-config.mjs'
import type { DragSnapshot, ZoomSnapshot } from './scale-sampling.mjs'

/**
 * Leafer 侧 S1/S2 规模 probe 页面（真实浏览器实测）。
 * 与 DOM 侧 browser/scale-page.tsx 同题：同一布局、同一边生成规则、同一
 * rAF 驱动动画、同一证据判据，只换渲染实现（Rect/Path 替 div/SVG）。
 *
 * 不起 dev server：由 probes/run-scale.mjs 用 Playwright page.route 静态伺服。
 * 页面把测量 API 挂到 window.__scaleProbe，runner 通过 evaluate 驱动与读数。
 */

interface Point { x: number; y: number }
interface Edge { from: number; to: number }
interface FpsSample { frames: number; elapsedMs: number; fps: number; longFrames: number }
interface FirstScreenSample {
  elapsedMs: number
  mountedNodeCount: number
  mountedConnectionCount: number
  visibleNodeCount: number
  /** 首屏像素证据：node0 中心采样到非空白像素（画布真的画出来了），及第几帧画出来 */
  paintedPixel: number[]
  paintedAfterFrames: number
}

interface LeaferScaleProbe {
  mountScenario(scenario: LeaferScaleProbeScenario): Promise<FirstScreenSample>
  sampleDrag(ms: number, longFrameThresholdMs: number): Promise<FpsSample>
  sampleZoom(ms: number, longFrameThresholdMs: number): Promise<FpsSample>
  dragSnapshot(): DragSnapshot
  zoomSnapshot(): ZoomSnapshot
}

declare global {
  interface Window { __scaleProbe: LeaferScaleProbe }
}

function requireView(): HTMLElement {
  const element = document.getElementById('view')
  if (element === null) throw new Error('缺少 #view')
  return element
}

const workload = LEAFER_SCALE_PROBE_WORKLOAD
const view = requireView()
const leafer = new Leafer({ view, width: workload.viewport.viewWidth, height: workload.viewport.viewHeight })

let positions: Point[] = []
let edges: Edge[] = []
let nodeRects: Rect[] = []
let connectionPaths: Path[] = []
let sceneUIs: IUI[] = []
let currentScale = workload.zoom.startScale

// 视觉与 DOM 探针逐项对齐：fill/stroke/圆角/线色/线宽——渲染成本口径一致才有可比性
const NODE_FILL = '#cfd8dc'
const NODE_FILL_DRAGGED = '#90caf9'
const NODE_STROKE = '#455a64'
const NODE_CORNER_RADIUS = 4
const CONNECTION_STROKE = '#78909c'
const CONNECTION_WIDTH = 2

function makePositions(count: number): Point[] {
  const { columns, originX, originY, gapX, gapY } = workload.layout
  return Array.from({ length: count }, (_, index) => ({
    x: originX + (index % columns) * (workload.nodeSize.width + gapX),
    y: originY + Math.floor(index / columns) * (workload.nodeSize.height + gapY),
  }))
}

function makeEdges(value: LeaferScaleProbeScenario): Edge[] {
  if (value.connectionPattern === 'fanin') {
    const target = value.nodeCount - 1
    return Array.from({ length: value.connectionCount }, (_, index) => ({ from: index, to: target }))
  }
  if (value.connectionPattern === 'distributed') {
    return Array.from({ length: value.connectionCount }, (_, index) => ({
      from: index % value.nodeCount,
      to: (index * 37 + 113) % value.nodeCount,
    }))
  }
  return []
}

/** 🔴 与 DOM 探针 connectionPath 同一条公式；注意它 ≠ core.computeConnectionCurve（无 160 上限），此处对齐 DOM 口径 */
function connectionPath(edge: Edge): string {
  const from = positions[edge.from]
  const to = positions[edge.to]
  if (from === undefined || to === undefined) throw new Error('连线引用了不存在的节点')
  const x1 = from.x + workload.nodeSize.width
  const y1 = from.y + workload.nodeSize.height / 2
  const x2 = to.x
  const y2 = to.y + workload.nodeSize.height / 2
  const bend = Math.max(40, Math.abs(x2 - x1) / 2)
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
}

function clearScene(): void {
  for (const ui of sceneUIs) ui.remove()
  sceneUIs = []
  nodeRects = []
  connectionPaths = []
}

/** 首屏像素证据：在 node0 中心附近采样，必须读到非空白像素（防「画面根本没更新」类假数据） */
function sampleNodePixel(): number[] | null {
  const origin = positions[0]
  if (origin === undefined) return null
  const dpr = window.devicePixelRatio || 1
  const cx = Math.floor((origin.x + workload.nodeSize.width / 2) * dpr)
  const cy = Math.floor((origin.y + workload.nodeSize.height / 2) * dpr)
  for (const canvas of Array.from(view.querySelectorAll('canvas'))) {
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    const data = ctx.getImageData(cx - 2, cy - 2, 4, 4).data
    let sum = 0
    for (let i = 0; i < data.length; i += 1) sum += data[i]!
    // 全透明(全 0)或纯白(每通道 255)都算「没画出来」
    if (sum > 0 && sum < (data.length / 4) * 4 * 255) return Array.from(data.slice(0, 4))
  }
  return null
}

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

async function mountScenario(value: LeaferScaleProbeScenario): Promise<FirstScreenSample> {
  const start = performance.now()
  clearScene()
  positions = makePositions(value.nodeCount)
  edges = makeEdges(value)
  currentScale = workload.zoom.startScale
  leafer.scale = currentScale
  leafer.x = 0
  leafer.y = 0

  // 连线层在所有节点之下（同生产 buildConnectionLayer 的层级约定），无命中、无端点圆点（对齐 DOM 探针口径）
  const layer = new Group({ hittable: false })
  for (const edge of edges) {
    const path = new Path({
      path: connectionPath(edge),
      stroke: CONNECTION_STROKE,
      strokeWidth: CONNECTION_WIDTH / currentScale,
    })
    layer.add(path)
    connectionPaths.push(path)
  }
  leafer.add(layer)
  sceneUIs.push(layer)

  nodeRects = positions.map((position, index) => {
    const rect = new Rect({
      x: position.x,
      y: position.y,
      width: workload.nodeSize.width,
      height: workload.nodeSize.height,
      fill: index === 0 ? NODE_FILL_DRAGGED : NODE_FILL,
      stroke: NODE_STROKE,
      strokeWidth: 1,
      cornerRadius: NODE_CORNER_RADIUS,
    })
    leafer.add(rect)
    return rect
  })
  sceneUIs.push(...nodeRects)

  if (nodeRects.length !== value.nodeCount || connectionPaths.length !== value.connectionCount) {
    throw new Error(`首屏挂载计数不符：nodes=${nodeRects.length}, connections=${connectionPaths.length}`)
  }

  // 等画布真画出来：最多等 3 帧，等不到就是「首屏没渲染」，抛错不写结果
  let paintedPixel: number[] | null = null
  let paintedAfterFrames = 0
  for (let frame = 0; frame < 3; frame += 1) {
    await nextFrame()
    paintedAfterFrames += 1
    paintedPixel = sampleNodePixel()
    if (paintedPixel !== null) break
  }
  if (paintedPixel === null) throw new Error(`${value.id} 首屏 3 帧后画布仍无 node0 像素`)

  // 可见计数与 DOM 探针同一几何判据（scale=1、offset=0 时与 getBoundingClientRect 等价）
  const { viewWidth, viewHeight } = workload.viewport
  const visibleNodeCount = positions.filter((position) =>
    position.x + workload.nodeSize.width > 0 && position.x < viewWidth &&
    position.y + workload.nodeSize.height > 0 && position.y < viewHeight,
  ).length
  if (visibleNodeCount === 0) throw new Error('首屏完成时没有节点进入可见区')

  return {
    elapsedMs: performance.now() - start,
    mountedNodeCount: nodeRects.length,
    mountedConnectionCount: connectionPaths.length,
    visibleNodeCount,
    paintedPixel,
    paintedAfterFrames,
  }
}

/** 与 DOM 探针 sampleAnimation 同构：rAF 内驱动变化并计帧，长帧阈值由 workload 给死 */
function sampleAnimation(
  ms: number,
  longFrameThresholdMs: number,
  update: (progress: number) => void,
): Promise<FpsSample> {
  return new Promise((resolve) => {
    let frames = 0
    let longFrames = 0
    let last = performance.now()
    const start = last
    const tick = (now: number): void => {
      frames += 1
      if (now - last > longFrameThresholdMs) longFrames += 1
      last = now
      const progress = Math.min(1, (now - start) / ms)
      update(progress)
      if (progress < 1) requestAnimationFrame(tick)
      else resolve({ frames, elapsedMs: now - start, fps: (frames / (now - start)) * 1000, longFrames })
    }
    requestAnimationFrame(tick)
  })
}

async function sampleDrag(ms: number, threshold: number): Promise<FpsSample> {
  const rect = nodeRects[0]
  const origin = positions[0]
  if (rect === undefined || origin === undefined) throw new Error('没有可拖拽节点')
  return sampleAnimation(ms, threshold, (progress) => {
    const next = {
      x: origin.x + workload.dragDelta.x * progress,
      y: origin.y + workload.dragDelta.y * progress,
    }
    positions[0] = next
    rect.x = next.x
    rect.y = next.y
  })
}

async function sampleZoom(ms: number, threshold: number): Promise<FpsSample> {
  currentScale = workload.zoom.startScale
  leafer.scale = currentScale
  return sampleAnimation(ms, threshold, (progress) => {
    currentScale = workload.zoom.startScale +
      (workload.zoom.endScale - workload.zoom.startScale) * progress
    leafer.scale = currentScale
    // DOM 探针每帧经 React 重渲更新全部 path 的 strokeWidth=2/scale；
    // retained-mode 侧的同题动作是逐条 path 更新 strokeWidth（视觉线宽恒定的反向补偿）
    const strokeWidth = CONNECTION_WIDTH / currentScale
    for (const path of connectionPaths) path.strokeWidth = strokeWidth
  })
}

/** 证据读数一律读渲染器里的真实对象，不读输入参数——防止「驱动没生效」的假证据 */
function dragSnapshot(): DragSnapshot {
  const rect = nodeRects[0]
  if (rect === undefined) throw new Error('没有可记录的拖拽节点')
  return { fwId: 'box-0', x: Number(rect.x), y: Number(rect.y) }
}

function zoomSnapshot(): ZoomSnapshot {
  return { scale: Number(leafer.scale ?? currentScale) }
}

window.__scaleProbe = { mountScenario, sampleDrag, sampleZoom, dragSnapshot, zoomSnapshot }
