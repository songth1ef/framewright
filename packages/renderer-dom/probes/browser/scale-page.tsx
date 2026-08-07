import {
  NOOP_RENDERER_CALLBACKS,
  applyNodeMoves,
  rewriteDemoImageRequests,
  selectDemoImageRequestTier,
  type FrameNode,
  type RenderContext,
  type RendererAdapter,
  type Viewport,
} from '@framewright/core'
import { createDomRenderer } from '../../src/index'
import { DOM_SCALE_PROBE_WORKLOAD, type DomScaleProbeScenario } from '../probe-config.mjs'
import { buildScaleFixture, countFixtureConnections } from './scale-fixture'
import {
  buildFrameStats,
  measureConnectionLayer,
  selectMountedLeafId,
  type FrameStats,
} from './scale-sampling.mjs'

interface FirstScreenSample {
  elapsedMs: number
  /** elapsedMs 中「等图片解码/下载」的部分；纯挂载 = elapsedMs - paintWaitMs */
  paintWaitMs: number
  fixtureBuildMs: number
  totalNodeCount: number
  totalConnectionCount: number
  evidenceNodeFwId: string
  mountedLogicalNodeCount: number
  mountedConnectionCount: number
  connectionLayerPresent: boolean
  mountedConnectionElementTypes: Record<string, number>
  mountedDomElementCount: number
  mountedToTotalRatio: number
  requestedImageCount: number
  decodedImageCount: number
  failedImageCount: number
  devicePixelRatio: number
  viewportPixelBudget: number
  requestedPixelBudget: number
  decodedPixelBudget: number
  decodedToViewportRatio: number
  maxDisplayStretchRatio: number
  maxVisibleStretchRatio: number
  decodedImages: Array<{
    url: string
    naturalWidth: number
    naturalHeight: number
    instanceCount: number
    displayWidth: number
    displayHeight: number
    visibleWidth: number
    visibleHeight: number
    displayStretchRatio: number
    visibleStretchRatio: number
  }>
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
  mountedConnectionCount(): number
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
let maxConnections: number | undefined
let evidenceNodeFwId: string | null = null

function context(): RenderContext {
  if (root === null) throw new Error('尚未挂载规模场景')
  return {
    root,
    viewport,
    selection: [],
    callbacks: NOOP_RENDERER_CALLBACKS,
    viewportSize: { width: view.clientWidth, height: view.clientHeight },
    cullingLimits: maxConnections === undefined ? undefined : { maxConnections },
  }
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

async function decodeMountedImages(): Promise<Pick<
  FirstScreenSample,
  | 'requestedImageCount'
  | 'decodedImageCount'
  | 'failedImageCount'
  | 'devicePixelRatio'
  | 'viewportPixelBudget'
  | 'requestedPixelBudget'
  | 'decodedPixelBudget'
  | 'decodedToViewportRatio'
  | 'maxDisplayStretchRatio'
  | 'maxVisibleStretchRatio'
  | 'decodedImages'
>> {
  const images = Array.from(view.querySelectorAll<HTMLImageElement>('img'))
  await Promise.allSettled(images.map(async (image) => {
    if (image.complete && image.naturalWidth > 0) return
    await image.decode()
  }))

  const decoded = images.filter((image) => image.naturalWidth > 0 && image.naturalHeight > 0)
  const viewRect = view.getBoundingClientRect()
  const grouped = new Map<string, FirstScreenSample['decodedImages'][number]>()
  for (const image of decoded) {
    const url = image.currentSrc || image.src
    const key = `${url}\n${image.naturalWidth}x${image.naturalHeight}`
    const existing = grouped.get(key)
    const rect = image.getBoundingClientRect()
    const visibleWidth = Math.max(0, Math.min(rect.right, viewRect.right) - Math.max(rect.left, viewRect.left))
    const visibleHeight = Math.max(0, Math.min(rect.bottom, viewRect.bottom) - Math.max(rect.top, viewRect.top))
    const evidence = {
      displayWidth: rect.width,
      displayHeight: rect.height,
      visibleWidth,
      visibleHeight,
      displayStretchRatio: rect.width / image.naturalWidth,
      visibleStretchRatio: visibleWidth / image.naturalWidth,
    }
    if (existing === undefined) {
      grouped.set(key, {
        url,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        instanceCount: 1,
        ...evidence,
      })
    } else {
      existing.instanceCount += 1
      existing.displayWidth = Math.max(existing.displayWidth, evidence.displayWidth)
      existing.displayHeight = Math.max(existing.displayHeight, evidence.displayHeight)
      existing.visibleWidth = Math.max(existing.visibleWidth, evidence.visibleWidth)
      existing.visibleHeight = Math.max(existing.visibleHeight, evidence.visibleHeight)
      existing.displayStretchRatio = Math.max(
        existing.displayStretchRatio,
        evidence.displayStretchRatio,
      )
      existing.visibleStretchRatio = Math.max(
        existing.visibleStretchRatio,
        evidence.visibleStretchRatio,
      )
    }
  }

  const requestedPixelBudget = images.reduce((total, image) => {
    const segments = new URL(image.currentSrc || image.src).pathname.split('/').filter(Boolean)
    const width = Number(segments.at(-2))
    const height = Number(segments.at(-1))
    return total + (
      Number.isSafeInteger(width) && Number.isSafeInteger(height) ? width * height : 0
    )
  }, 0)
  const decodedPixelBudget = decoded.reduce(
    (total, image) => total + image.naturalWidth * image.naturalHeight,
    0,
  )
  const viewportPixelBudget = view.clientWidth * view.clientHeight * window.devicePixelRatio ** 2
  const decodedImages = [...grouped.values()].sort((left, right) => left.url.localeCompare(right.url))

  return {
    requestedImageCount: images.length,
    decodedImageCount: decoded.length,
    failedImageCount: images.length - decoded.length,
    devicePixelRatio: window.devicePixelRatio,
    viewportPixelBudget,
    requestedPixelBudget,
    decodedPixelBudget,
    decodedToViewportRatio: viewportPixelBudget === 0 ? 0 : decodedPixelBudget / viewportPixelBudget,
    maxDisplayStretchRatio: decodedImages.reduce(
      (maximum, image) => Math.max(maximum, image.displayStretchRatio),
      0,
    ),
    maxVisibleStretchRatio: decodedImages.reduce(
      (maximum, image) => Math.max(maximum, image.visibleStretchRatio),
      0,
    ),
    decodedImages,
  }
}

async function mountScenario(scenario: DomScaleProbeScenario): Promise<FirstScreenSample> {
  renderer?.destroy()
  renderer = null
  view.replaceChildren()
  const fixtureStart = performance.now()
  initialScale = scenario.initialScale ?? workload.zoom.startScale
  root = rewriteDemoImageRequests(
    buildScaleFixture(scenario),
    {
      tier: selectDemoImageRequestTier(initialScale, window.devicePixelRatio),
      viewportSize: { width: view.clientWidth, height: view.clientHeight },
      devicePixelRatio: window.devicePixelRatio,
    },
  )
  const fixtureBuildMs = performance.now() - fixtureStart
  maxConnections = 'maxConnections' in scenario && typeof scenario.maxConnections === 'number'
    ? scenario.maxConnections
    : undefined
  viewport = {
    scale: initialScale,
    offsetX: 0,
    offsetY: 0,
  }

  const start = performance.now()
  renderer = createDomRenderer()
  renderer.mount(view, context())
  await waitForMountedNodes()
  // 🔴 decodeMountedImages 里含**真实网络下载**(picsum 实测首字节 5.5-6.6 秒)。
  // 它此前被整个算进 elapsedMs,于是「首屏 ms」这一列量的主要是网络,不是渲染。
  // 单独计时才能把两者分开,见 §8.8.1。
  const paintWaitStart = performance.now()
  const imageEvidence = await decodeMountedImages()
  const paintWaitMs = performance.now() - paintWaitStart
  const elapsedMs = performance.now() - start

  const mountedNodes = view.querySelectorAll('[data-fw-id]:not([data-fw-type="frame"])').length
  const mountedIds = Array.from(
    view.querySelectorAll<HTMLElement>('[data-fw-id]'),
    (element) => element.dataset.fwId,
  ).filter((fwId): fwId is string => fwId !== undefined)
  evidenceNodeFwId = selectMountedLeafId(mountedIds, root.fwId)
  const connectionMeasurement = measureConnectionLayer(
    view.querySelector('[data-fw-connections]'),
  )
  if (mountedNodes === 0) throw new Error('裁剪后没有实际挂载素材节点')
  if (scenario.initialScale === undefined && mountedNodes >= scenario.nodeCount) {
    throw new Error(`视口裁剪未生效：mounted=${mountedNodes}, total=${scenario.nodeCount}`)
  }

  return {
    elapsedMs,
    paintWaitMs,
    fixtureBuildMs,
    totalNodeCount: scenario.nodeCount,
    totalConnectionCount: countFixtureConnections(root),
    evidenceNodeFwId,
    mountedLogicalNodeCount: mountedNodes,
    ...connectionMeasurement,
    mountedDomElementCount: view.querySelectorAll('*').length,
    mountedToTotalRatio: mountedNodes / scenario.nodeCount,
    ...imageEvidence,
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
  const node = root.children.find((candidate) => candidate.fwId === evidenceNodeFwId)
  if (node === undefined) throw new Error(`${evidenceNodeFwId ?? '未知节点'} 不在场景数据中`)
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
  const node = root?.children.find((candidate) => candidate.fwId === evidenceNodeFwId)
  if (node === undefined) throw new Error(`${evidenceNodeFwId ?? '未知节点'} 不在场景数据中`)
  return { fwId: node.fwId, x: node.x, y: node.y }
}

function zoomSnapshot(): ZoomSnapshot {
  return { scale: viewport.scale }
}

function panSnapshot(): PanSnapshot {
  return { offsetX: viewport.offsetX, offsetY: viewport.offsetY }
}

function mountedConnectionCount(): number {
  return measureConnectionLayer(view.querySelector('[data-fw-connections]')).mountedConnectionCount
}

function destroy(): void {
  renderer?.destroy()
  renderer = null
  root = null
  evidenceNodeFwId = null
  maxConnections = undefined
}

window.__scaleProbe = {
  mountScenario,
  sampleDrag,
  sampleZoom,
  samplePan,
  dragSnapshot,
  zoomSnapshot,
  panSnapshot,
  mountedConnectionCount,
  destroy,
}
