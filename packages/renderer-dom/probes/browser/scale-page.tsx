import {
  NOOP_RENDERER_CALLBACKS,
  applyNodeMoves,
  type FrameNode,
  type RenderContext,
  type RendererAdapter,
  type Viewport,
} from '@framewright/core'
import { createDomRenderer } from '../../src/index'
import { DOM_SCALE_PROBE_WORKLOAD, type DomScaleProbeScenario } from '../probe-config.mjs'
import { buildScaleFixture, countFixtureConnections } from './scale-fixture'
import { buildFrameStats, type FrameStats } from './scale-sampling.mjs'

interface FirstScreenSample {
  elapsedMs: number
  fixtureBuildMs: number
  totalNodeCount: number
  totalConnectionCount: number
  mountedLogicalNodeCount: number
  mountedConnectionCount: number
  mountedDomElementCount: number
  mountedToTotalRatio: number
}

interface PanSnapshot { offsetX: number; offsetY: number }
interface DragSnapshot { fwId: string; x: number; y: number }
interface ZoomSnapshot { scale: number }

interface DomScaleProbe {
  mountScenario(scenario: DomScaleProbeScenario): Promise<FirstScreenSample>
  sampleDrag(ms: number, longFrameThresholdMs: number): Promise<FrameStats>
  sampleZoom(ms: number, longFrameThresholdMs: number): Promise<FrameStats>
  samplePan(
    ms: number,
    longFrameThresholdMs: number,
    panDelta?: Readonly<{ x: number; y: number }>,
  ): Promise<FrameStats>
  dragSnapshot(): DragSnapshot
  zoomSnapshot(): ZoomSnapshot
  panSnapshot(): PanSnapshot
  destroy(): void
}

declare global {
  interface Window { __scaleProbe: DomScaleProbe }
}

const workload = DOM_SCALE_PROBE_WORKLOAD
const view = document.getElementById('view')
if (view === null) throw new Error('缺少 #view')

let renderer: RendererAdapter | null = null
let root: FrameNode | null = null
let viewport: Viewport = { scale: workload.zoom.startScale, offsetX: 0, offsetY: 0 }
let initialScale = workload.zoom.startScale

function context(): RenderContext {
  if (root === null) throw new Error('尚未挂载规模场景')
  return { root, viewport, selection: [], callbacks: NOOP_RENDERER_CALLBACKS }
}

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

async function waitForMountedNodes(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await nextFrame()
    if (view.querySelector('[data-fw-id]') !== null) return
  }
  throw new Error('首屏 60 帧内没有挂载任何节点')
}

async function mountScenario(scenario: DomScaleProbeScenario): Promise<FirstScreenSample> {
  renderer?.destroy()
  renderer = null
  view.replaceChildren()
  const fixtureStart = performance.now()
  root = buildScaleFixture(scenario)
  const fixtureBuildMs = performance.now() - fixtureStart
  initialScale = scenario.initialScale ?? workload.zoom.startScale
  viewport = {
    scale: initialScale,
    offsetX: 0,
    offsetY: 0,
  }

  const start = performance.now()
  renderer = createDomRenderer()
  renderer.mount(view, context())
  await waitForMountedNodes()
  const elapsedMs = performance.now() - start

  const mountedNodes = view.querySelectorAll('[data-fw-id]:not([data-fw-type="frame"])').length
  const mountedConnections = view.querySelectorAll('[data-fw-connections] path').length
  if (mountedNodes === 0) throw new Error('裁剪后没有实际挂载素材节点')
  if (scenario.initialScale === undefined && mountedNodes >= scenario.nodeCount) {
    throw new Error(`视口裁剪未生效：mounted=${mountedNodes}, total=${scenario.nodeCount}`)
  }

  return {
    elapsedMs,
    fixtureBuildMs,
    totalNodeCount: scenario.nodeCount,
    totalConnectionCount: countFixtureConnections(root),
    mountedLogicalNodeCount: mountedNodes,
    mountedConnectionCount: mountedConnections,
    mountedDomElementCount: view.querySelectorAll('*').length,
    mountedToTotalRatio: mountedNodes / scenario.nodeCount,
  }
}

function sampleAnimation(
  ms: number,
  longFrameThresholdMs: number,
  update: (progress: number) => void,
): Promise<FrameStats> {
  if (renderer === null) throw new Error('尚未挂载规模场景')
  return new Promise((resolve) => {
    const frameDurations: number[] = []
    let last = 0
    let start = 0
    const tick = (now: number): void => {
      frameDurations.push(now - last)
      last = now
      const progress = Math.min(1, (now - start) / ms)
      update(progress)
      renderer?.update(context())
      if (progress < 1) requestAnimationFrame(tick)
      else resolve(buildFrameStats(frameDurations, longFrameThresholdMs))
    }
    requestAnimationFrame((now) => {
      start = now
      last = now
      requestAnimationFrame(tick)
    })
  })
}

async function sampleDrag(ms: number, threshold: number): Promise<FrameStats> {
  if (root === null) throw new Error('尚未挂载规模场景')
  viewport = { scale: initialScale, offsetX: 0, offsetY: 0 }
  const node = root.children[0]
  if (node === undefined) throw new Error('没有可拖拽节点')
  const origin = { x: node.x, y: node.y }
  return sampleAnimation(ms, threshold, (progress) => {
    if (root === null) return
    root = applyNodeMoves(root, [{
      fwId: node.fwId,
      parentFwId: root.fwId,
      x: origin.x + workload.dragDelta.x * progress,
      y: origin.y + workload.dragDelta.y * progress,
    }])
  })
}

async function sampleZoom(ms: number, threshold: number): Promise<FrameStats> {
  viewport = { scale: workload.zoom.startScale, offsetX: 0, offsetY: 0 }
  renderer?.update(context())
  return sampleAnimation(ms, threshold, (progress) => {
    viewport = {
      ...viewport,
      scale: workload.zoom.startScale +
        (workload.zoom.endScale - workload.zoom.startScale) * progress,
    }
  })
}

async function samplePan(
  ms: number,
  threshold: number,
  panDelta: Readonly<{ x: number; y: number }> = workload.panDelta,
): Promise<FrameStats> {
  viewport = {
    scale: initialScale,
    offsetX: 0,
    offsetY: 0,
  }
  renderer?.update(context())
  return sampleAnimation(ms, threshold, (progress) => {
    viewport = {
      scale: initialScale,
      offsetX: panDelta.x * progress,
      offsetY: panDelta.y * progress,
    }
  })
}

function dragSnapshot(): DragSnapshot {
  const node = root?.children[0]
  if (node === undefined) throw new Error('没有可记录的拖拽节点')
  return { fwId: node.fwId, x: node.x, y: node.y }
}

function zoomSnapshot(): ZoomSnapshot {
  return { scale: viewport.scale }
}

function panSnapshot(): PanSnapshot {
  return { offsetX: viewport.offsetX, offsetY: viewport.offsetY }
}

function destroy(): void {
  renderer?.destroy()
  renderer = null
  root = null
}

window.__scaleProbe = {
  mountScenario,
  sampleDrag,
  sampleZoom,
  samplePan,
  dragSnapshot,
  zoomSnapshot,
  panSnapshot,
  destroy,
}
