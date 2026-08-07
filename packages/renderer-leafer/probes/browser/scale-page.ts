import {
  NOOP_RENDERER_CALLBACKS,
  type FrameNode,
  type RenderContext,
  type Viewport,
} from '@framewright/core'
import { Leafer, type IUI } from 'leafer-ui'
import { LeaferViewportScene } from '../../src/viewport-culling'
import { setVideoElementFactoryForTest } from '../../src/video/video-paint'
import {
  LEAFER_SCALE_PROBE_WORKLOAD,
  type LeaferScaleProbeScenario,
} from '../probe-config.mjs'
import { buildScaleFixture, countFixtureConnections } from './scale-fixture'
import { createAnonymousProbeVideoElement } from './probe-media'
import {
  buildFrameStats,
  selectMountedLeafId,
  type FrameSample,
} from './scale-sampling.mjs'
import type { DragSnapshot, PanSnapshot, ZoomSnapshot } from './scale-sampling.mjs'

interface FirstScreenSample {
  elapsedMs: number
  fixtureBuildMs: number
  totalNodeCount: number
  totalConnectionCount: number
  evidenceNodeFwId: string
  mountedLogicalNodeCount: number
  mountedConnectionCount: number
  mountedLeaferInstanceCount: number
  mountedToTotalRatio: number
  paintedPixel: number[]
  paintedAfterFrames: number
  /** 等首个像素的耗时；证据节点是图片时这里主要是网络下载，不是渲染 */
  paintWaitMs: number
}

interface LeaferScaleProbe {
  mountScenario(scenario: LeaferScaleProbeScenario): Promise<FirstScreenSample>
  sampleDrag(ms: number, threshold: number): Promise<FrameSample>
  sampleZoom(ms: number, threshold: number): Promise<FrameSample>
  samplePan(
    ms: number,
    threshold: number,
    panDelta?: Readonly<{ x: number; y: number }>,
  ): Promise<FrameSample>
  dragSnapshot(): DragSnapshot
  zoomSnapshot(): ZoomSnapshot
  panSnapshot(): PanSnapshot
  mountedConnectionCount(): number
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
// 仅探针启用：应用完整素材集包含不能用 anonymous CORS 加载的长视频。
setVideoElementFactoryForTest(createAnonymousProbeVideoElement)
const view = requireView()
const screen = { width: workload.viewport.viewWidth, height: workload.viewport.viewHeight }
const leafer = new Leafer({ view, ...screen })
let scene = new LeaferViewportScene(leafer)
let root: FrameNode | null = null
let viewport: Viewport = { scale: 1, offsetX: 0, offsetY: 0 }
let initialScale = workload.zoom.startScale
let evidenceNodeFwId: string | null = null

function context(): RenderContext {
  if (root === null) throw new Error('规模场景尚未挂载')
  return { root, viewport, selection: [], callbacks: NOOP_RENDERER_CALLBACKS }
}

function applyViewport(next: Viewport): void {
  viewport = next
  leafer.scale = next.scale
  leafer.x = next.offsetX
  leafer.y = next.offsetY
}

function resetScene(nextRoot: FrameNode, nextInitialScale: number): void {
  scene.destroy()
  scene = new LeaferViewportScene(leafer)
  root = nextRoot
  evidenceNodeFwId = null
  initialScale = nextInitialScale
  applyViewport({ scale: initialScale, offsetX: 0, offsetY: 0 })
}

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

function countUiDescendants(ui: IUI): number {
  let total = 1
  for (const child of ui.children ?? []) total += countUiDescendants(child)
  return total
}

function countMountedLeaferInstances(): number {
  let total = 0
  for (const child of leafer.children ?? []) total += countUiDescendants(child)
  return total
}

function countMountedConnections(): number {
  return scene.getMountedConnectionCount()
}

/**
 * 🔴「已挂载」不等于「屏幕上看得见」。
 *
 * 挂载集合包含 overscan 区 —— 视口外一圈也会被挂上。原实现挑的是**第一个**已挂载的
 * 生成节点，它很可能落在可视区之外，于是 `sampleNodePixel` 永远取不到像素，
 * 探针以「首屏 N 帧后仍无 xxx 像素」失败。
 *
 * 这不是假想问题：把夹具格子从 160×100 放大到 480×300 后，同屏装得下的节点变少，
 * 原来碰巧可见的那个节点就跑到屏幕外去了，整个 Leafer 探针直接跑不起来。
 *
 * 所以这里按**屏幕坐标**筛，只认和画布可视区真正有交集的节点。
 *
 * 🔴 判据是**交集**不是中心点。中心点判据在高倍率下会整体失效：800% 时
 * scale-node-0 的屏幕矩形是 (320,320)-(3920,2720)，铺满整个 960×1300 可视区，
 * 但它的中心 (2120,1520) 在屏幕外 —— 于是「筛可见」筛不出任何节点，
 * 兜底又挑回这个节点，采样点仍取中心，`cx >= canvas.width` 直接跳过，
 * 探针报「首屏 10 帧后仍无像素」。节点明明铺满屏幕，量的地方却在屏幕外。
 * 实测取证见 docs/architecture.md §8.7.2。
 */
function visibleCenterOf(node: {
  x: number; y: number; width: number; height: number
}): { x: number; y: number } | null {
  const left = node.x * viewport.scale + viewport.offsetX
  const top = node.y * viewport.scale + viewport.offsetY
  const l = Math.max(left, 0)
  const t = Math.max(top, 0)
  const r = Math.min(left + node.width * viewport.scale, view.clientWidth)
  const b = Math.min(top + node.height * viewport.scale, view.clientHeight)
  // 取样窗口是 4×4 且向外各扩 2px，交集窄于 8px 放不下，按不可见处理
  if (r - l < 8 || b - t < 8) return null
  return { x: (l + r) / 2, y: (t + b) / 2 }
}

function selectPaintableLeafId(mountedIds: readonly string[], nextRoot: FrameNode): string {
  const mounted = new Set(mountedIds)
  const isOnScreen = (node: { x: number; y: number; width: number; height: number }): boolean =>
    visibleCenterOf(node) !== null

  const visibleGenerated = nextRoot.children.find(
    (node) =>
      mounted.has(node.fwId) &&
      (node.fwType === 'ai-image' || node.fwType === 'ai-video') &&
      isOnScreen(node),
  )
  if (visibleGenerated !== undefined) return visibleGenerated.fwId

  // 退一步：任何可见的已挂载节点都行，画得出像素就能当旁证
  const visibleAny = nextRoot.children.find(
    (node) => mounted.has(node.fwId) && node.fwId !== nextRoot.fwId && isOnScreen(node),
  )
  if (visibleAny !== undefined) return visibleAny.fwId

  return selectMountedLeafId(mountedIds, nextRoot.fwId)
}

function sampleNodePixel(): number[] | null {
  const node = root?.children.find((candidate) => candidate.fwId === evidenceNodeFwId)
  if (node === undefined) return null
  // 采样点必须和 selectPaintableLeafId 用同一个判据（交集中心），
  // 否则会出现「筛的时候算可见、采的时候采到屏幕外」这种自相矛盾。
  const center = visibleCenterOf(node)
  if (center === null) return null
  const dpr = window.devicePixelRatio || 1
  const cx = Math.floor(center.x * dpr)
  const cy = Math.floor(center.y * dpr)
  for (const canvas of Array.from(view.querySelectorAll('canvas'))) {
    const ctx = canvas.getContext('2d')
    if (ctx === null || cx < 2 || cy < 2 || cx >= canvas.width || cy >= canvas.height) continue
    const data = ctx.getImageData(cx - 2, cy - 2, 4, 4).data
    for (let index = 3; index < data.length; index += 4) {
      if ((data[index] ?? 0) > 0) return Array.from(data.slice(0, 4))
    }
  }
  return null
}

async function mountScenario(value: LeaferScaleProbeScenario): Promise<FirstScreenSample> {
  const fixtureStart = performance.now()
  const nextRoot = buildScaleFixture(value)
  const fixtureBuildMs = performance.now() - fixtureStart
  resetScene(nextRoot, value.initialScale ?? workload.zoom.startScale)

  const renderStart = performance.now()
  scene.reconcile(context(), screen)
  const mountedIds = scene.getMountedNodeIds()
  evidenceNodeFwId = selectPaintableLeafId(mountedIds, nextRoot)
  let paintedPixel: number[] | null = null
  let paintedAfterFrames = 0
  // 🔴 预算按**时间**给，不按帧数。
  // 原先固定 10 帧(约 166ms)。800% 下唯一进可视区的是 img 节点,而它要等
  // picsum 的真实网络下载 —— 实测一次 416 帧(约 7 秒)才出像素,另一次 900 帧
  // (约 15 秒)仍没出。于是这三档永远 timeout,而失败原因和渲染器毫无关系。
  const paintWaitStart = performance.now()
  const PAINT_BUDGET_MS = 20_000
  while (performance.now() - paintWaitStart < PAINT_BUDGET_MS) {
    await nextFrame()
    paintedAfterFrames += 1
    paintedPixel = sampleNodePixel()
    if (paintedPixel !== null) break
  }
  const paintWaitMs = performance.now() - paintWaitStart
  if (paintedPixel === null) {
    // 报出采样点与画布尺寸:没有这些数字,「无像素」既可能是真没画,
    // 也可能是采样点根本落在画布外 —— 两者的修法完全不同。
    const n = root?.children.find((c) => c.fwId === evidenceNodeFwId)
    const dpr = window.devicePixelRatio || 1
    const c0 = n === undefined ? null : visibleCenterOf(n)
    const at = n === undefined ? 'node-not-found' :
      `sampleAt=${c0 === null ? 'no-intersection' : `(${Math.floor(c0.x * dpr)},${Math.floor(c0.y * dpr)})`}` +
      ` nodeRect=(${n.x},${n.y},${n.width}x${n.height}) fwType=${n.fwType}`
    // 「这个点没像素」和「整块画布全空」是两个截然不同的故障。不区分就只能猜。
    const canvases = Array.from(view.querySelectorAll('canvas')).map((c) => {
      const ctx = c.getContext('2d')
      let painted = 0
      if (ctx !== null && c.width > 0 && c.height > 0) {
        const d = ctx.getImageData(0, 0, c.width, c.height).data
        for (let i = 3; i < d.length; i += 4) if ((d[i] ?? 0) > 0) painted += 1
      }
      return `${c.width}x${c.height}(不透明像素${painted})`
    }).join(',')
    throw new Error(
      `${value.id} 首屏等待 ${Math.round(paintWaitMs)}ms（${paintedAfterFrames} 帧）后仍无 ${evidenceNodeFwId} 像素` +
      ` | ${at} scale=${viewport.scale} offset=(${viewport.offsetX},${viewport.offsetY})` +
      ` view=${view.clientWidth}x${view.clientHeight} canvases=[${canvases}] dpr=${dpr}`,
    )
  }

  const mountedLogicalNodeCount = mountedIds.filter((fwId) => fwId !== nextRoot.fwId).length
  const totalConnectionCount = countFixtureConnections(nextRoot)
  if (
    mountedLogicalNodeCount <= 0 ||
    (value.initialScale === undefined && mountedLogicalNodeCount >= value.nodeCount)
  ) {
    throw new Error(
      `${value.id} 裁剪挂载证据无效：mounted=${mountedLogicalNodeCount}, total=${value.nodeCount}`,
    )
  }

  return {
    // ⚠️ elapsedMs 含「等首个像素」的时间。当证据节点是图片时，这里面有一大截
    // 是 picsum 的网络下载，不是渲染耗时 —— 800% 下实测可达 7 秒。
    // 要看纯渲染，用 elapsedMs - paintWaitMs；paintWaitMs 单独记就是为了让这一刀切得开。
    // 本仓记过「仪表不对称会把网络延迟当成实现差距」，这条同样适用于自己。
    elapsedMs: performance.now() - renderStart,
    paintWaitMs,
    fixtureBuildMs,
    totalNodeCount: value.nodeCount,
    totalConnectionCount,
    evidenceNodeFwId,
    mountedLogicalNodeCount,
    mountedConnectionCount: countMountedConnections(),
    mountedLeaferInstanceCount: countMountedLeaferInstances(),
    mountedToTotalRatio: mountedLogicalNodeCount / value.nodeCount,
    paintedPixel,
    paintedAfterFrames,
  }
}

function sampleAnimation(
  ms: number,
  longFrameThresholdMs: number,
  update: (progress: number) => void,
): Promise<FrameSample> {
  return new Promise((resolve) => {
    const durations: number[] = []
    const start = performance.now()
    let last = start
    const tick = (): void => {
      // Leafer 的调度层可能包装 rAF 而不透传 DOMHighResTimeStamp；统一读页面单调时钟。
      const now = performance.now()
      durations.push(now - last)
      last = now
      const progress = Math.min(1, (now - start) / ms)
      update(progress)
      if (progress < 1) requestAnimationFrame(tick)
      else resolve(buildFrameStats(durations, longFrameThresholdMs))
    }
    requestAnimationFrame(tick)
  })
}

async function sampleDrag(ms: number, threshold: number): Promise<FrameSample> {
  const node = root?.children.find((candidate) => candidate.fwId === evidenceNodeFwId)
  if (node === undefined) throw new Error(`${evidenceNodeFwId ?? '未知节点'} 不在场景数据中`)
  const start = { x: node.x, y: node.y }
  return sampleAnimation(ms, threshold, (progress) => {
    scene.reconcile(context(), screen, {
      moves: [{
        fwId: node.fwId,
        parentFwId: root?.fwId ?? '',
        x: start.x + workload.dragDelta.x * progress,
        y: start.y + workload.dragDelta.y * progress,
      }],
    })
  })
}

async function sampleZoom(ms: number, threshold: number): Promise<FrameSample> {
  return sampleAnimation(ms, threshold, (progress) => {
    applyViewport({
      ...viewport,
      scale: workload.zoom.startScale +
        (workload.zoom.endScale - workload.zoom.startScale) * progress,
    })
    scene.reconcile(context(), screen)
  })
}

async function samplePan(
  ms: number,
  threshold: number,
  panDelta?: Readonly<{ x: number; y: number }>,
): Promise<FrameSample> {
  const start = { offsetX: workload.pan.startOffsetX, offsetY: workload.pan.startOffsetY }
  const end = panDelta === undefined
    ? { offsetX: workload.pan.endOffsetX, offsetY: workload.pan.endOffsetY }
    : { offsetX: start.offsetX + panDelta.x, offsetY: start.offsetY + panDelta.y }
  applyViewport({ scale: initialScale, ...start })
  scene.reconcile(context(), screen)
  return sampleAnimation(ms, threshold, (progress) => {
    applyViewport({
      scale: initialScale,
      offsetX: start.offsetX + (end.offsetX - start.offsetX) * progress,
      offsetY: start.offsetY + (end.offsetY - start.offsetY) * progress,
    })
    scene.reconcile(context(), screen)
  })
}

function dragSnapshot(): DragSnapshot {
  const node = root?.children.find((candidate) => candidate.fwId === evidenceNodeFwId)
  if (node === undefined) throw new Error(`${evidenceNodeFwId ?? '未知节点'} 不在场景数据中`)
  const ui = scene.getMountedUi(node.fwId)
  if (ui === undefined) throw new Error(`${node.fwId} 未实际挂载`)
  return { fwId: node.fwId, x: Number(ui.x), y: Number(ui.y) }
}

function zoomSnapshot(): ZoomSnapshot {
  return { scale: Number(leafer.scale) }
}

function panSnapshot(): PanSnapshot {
  return { offsetX: Number(leafer.x), offsetY: Number(leafer.y) }
}

window.__scaleProbe = {
  mountScenario,
  sampleDrag,
  sampleZoom,
  samplePan,
  dragSnapshot,
  zoomSnapshot,
  panSnapshot,
  mountedConnectionCount: countMountedConnections,
}
