import {
  NOOP_RENDERER_CALLBACKS,
  type FrameNode,
  type RenderContext,
  type Viewport,
} from '@framewright/core'
import { Leafer, Path, type IUI } from 'leafer-ui'
import { LeaferViewportScene } from '../../src/viewport-culling'
import {
  LEAFER_SCALE_PROBE_WORKLOAD,
  type LeaferScaleProbeScenario,
} from '../probe-config.mjs'
import { buildScaleFixture, countFixtureConnections } from './scale-fixture'
import { buildFrameStats, type FrameSample } from './scale-sampling.mjs'
import type { DragSnapshot, PanSnapshot, ZoomSnapshot } from './scale-sampling.mjs'

interface FirstScreenSample {
  elapsedMs: number
  fixtureBuildMs: number
  totalNodeCount: number
  totalConnectionCount: number
  mountedLogicalNodeCount: number
  mountedConnectionCount: number
  mountedLeaferInstanceCount: number
  mountedToTotalRatio: number
  paintedPixel: number[]
  paintedAfterFrames: number
}

interface LeaferScaleProbe {
  mountScenario(scenario: LeaferScaleProbeScenario): Promise<FirstScreenSample>
  sampleDrag(ms: number, threshold: number): Promise<FrameSample>
  sampleZoom(ms: number, threshold: number): Promise<FrameSample>
  samplePan(ms: number, threshold: number): Promise<FrameSample>
  dragSnapshot(): DragSnapshot
  zoomSnapshot(): ZoomSnapshot
  panSnapshot(): PanSnapshot
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
const screen = { width: workload.viewport.viewWidth, height: workload.viewport.viewHeight }
const leafer = new Leafer({ view, ...screen })
let scene = new LeaferViewportScene(leafer)
let root: FrameNode | null = null
let viewport: Viewport = { scale: 1, offsetX: 0, offsetY: 0 }

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

function resetScene(nextRoot: FrameNode): void {
  scene.destroy()
  scene = new LeaferViewportScene(leafer)
  root = nextRoot
  applyViewport({ scale: workload.zoom.startScale, offsetX: 0, offsetY: 0 })
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
  return (scene.getConnectionLayer()?.children ?? []).filter((child) => child instanceof Path).length
}

function sampleNodePixel(): number[] | null {
  const node = root?.children[0]
  if (node === undefined) return null
  const dpr = window.devicePixelRatio || 1
  const cx = Math.floor((node.x + node.width / 2) * viewport.scale * dpr + viewport.offsetX * dpr)
  const cy = Math.floor((node.y + node.height / 2) * viewport.scale * dpr + viewport.offsetY * dpr)
  for (const canvas of Array.from(view.querySelectorAll('canvas'))) {
    const ctx = canvas.getContext('2d')
    if (ctx === null || cx < 2 || cy < 2 || cx >= canvas.width || cy >= canvas.height) continue
    const data = ctx.getImageData(cx - 2, cy - 2, 4, 4).data
    let sum = 0
    for (let index = 0; index < data.length; index += 1) sum += data[index] ?? 0
    if (sum > 0 && sum < (data.length / 4) * 4 * 255) return Array.from(data.slice(0, 4))
  }
  return null
}

async function mountScenario(value: LeaferScaleProbeScenario): Promise<FirstScreenSample> {
  const fixtureStart = performance.now()
  const nextRoot = buildScaleFixture(value)
  const fixtureBuildMs = performance.now() - fixtureStart
  resetScene(nextRoot)

  const renderStart = performance.now()
  scene.reconcile(context(), screen)
  let paintedPixel: number[] | null = null
  let paintedAfterFrames = 0
  for (let frame = 0; frame < 10; frame += 1) {
    await nextFrame()
    paintedAfterFrames += 1
    paintedPixel = sampleNodePixel()
    if (paintedPixel !== null) break
  }
  if (paintedPixel === null) throw new Error(`${value.id} 首屏 10 帧后仍无 scale-node-0 像素`)

  const mountedIds = scene.getMountedNodeIds()
  const mountedLogicalNodeCount = mountedIds.filter((fwId) => fwId !== nextRoot.fwId).length
  const totalConnectionCount = countFixtureConnections(nextRoot)
  if (mountedLogicalNodeCount <= 0 || mountedLogicalNodeCount >= value.nodeCount) {
    throw new Error(
      `${value.id} 裁剪挂载证据无效：mounted=${mountedLogicalNodeCount}, total=${value.nodeCount}`,
    )
  }

  return {
    elapsedMs: performance.now() - renderStart,
    fixtureBuildMs,
    totalNodeCount: value.nodeCount,
    totalConnectionCount,
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
  const node = root?.children[0]
  if (node === undefined) throw new Error('没有可拖拽节点')
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

async function samplePan(ms: number, threshold: number): Promise<FrameSample> {
  const start = {
    offsetX: workload.pan.startOffsetX,
    offsetY: workload.pan.startOffsetY,
  }
  applyViewport({ scale: workload.zoom.startScale, ...start })
  scene.reconcile(context(), screen)
  return sampleAnimation(ms, threshold, (progress) => {
    applyViewport({
      scale: workload.zoom.startScale,
      offsetX: start.offsetX + (workload.pan.endOffsetX - start.offsetX) * progress,
      offsetY: start.offsetY + (workload.pan.endOffsetY - start.offsetY) * progress,
    })
    scene.reconcile(context(), screen)
  })
}

function dragSnapshot(): DragSnapshot {
  const node = root?.children[0]
  if (node === undefined) throw new Error('没有可记录的拖拽节点')
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
}
