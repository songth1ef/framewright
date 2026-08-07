import {
  CORS_SAFE_PROBE_MEDIA_ASSETS,
  NOOP_RENDERER_CALLBACKS,
  applyNodeMoves,
  createScaleFixture,
  isAiImageNode,
  isAiVideoNode,
  type FrameNode,
  type Point,
  type RenderContext,
  type RendererAdapter,
  type Viewport,
} from '@framewright/core'
import { createReactFlowProbeRenderer } from '../../src/index'
import { REACT_FLOW_SCALE_WORKLOAD } from '../probe-config.mjs'
import { buildFrameStats, buildDragEvidence, buildPanEvidence, type FrameStats } from './sampling.mjs'

interface ZoomOutScenario {
  id?: string
  label?: string
  nodeCount: number
  connectionPattern: 'none' | 'fanin' | 'distributed' | 'many-to-many'
  initialScale?: number
  maxConnections?: number
  miniMap?: boolean
  /** 喂给 React Flow 前先用我们自己的裁剪过滤 —— 三方同题对照的前提。 */
  preCull?: boolean
  /** React Flow 内建的视口裁剪。默认 true（它自己的行为）。 */
  onlyRenderVisibleElements?: boolean
}

interface LegacyScenario { scale: number; miniMap: boolean }

interface FirstScreenSample {
  elapsedMs: number
  /** 该探针不等图片，恒为 0；保留字段是为了让口径差异在产物里可见 */
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
  decodedImages: unknown[]
}

interface PanSnapshot { offsetX: number; offsetY: number }
interface DragSnapshot { fwId: string; x: number; y: number }

interface ReactFlowScaleProbe {
  /** 旧版 run-scale.mjs / run-native.mjs 入口。 */
  mount(scenario: LegacyScenario): Promise<Record<string, unknown>>
  /** 统一 zoom-out 基准入口，与 DOM 侧 mountScenario 同名同签名。 */
  mountScenario(scenario: ZoomOutScenario): Promise<FirstScreenSample>
  sampleDrag(ms: number, threshold: number): Promise<FrameStats>
  samplePan(ms: number, threshold: number, panDelta?: Readonly<{ x: number; y: number }>): Promise<FrameStats>
  dragSnapshot(): DragSnapshot
  panSnapshot(): PanSnapshot
  mountedConnectionCount(): number
  destroy(): void
  /** run-native.mjs 专用，不在统一基准里。 */
  domNodeSnapshot?(): { fwId: string; transform: string; x: number; y: number }
  startFrameRecording?(): void
  stopFrameRecording?(threshold: number): FrameStats
  panePoint?(): Point
  sampleFrames?(ms: number, threshold: number): Promise<FrameStats>
}

declare global {
  interface Window {
    __reactFlowScaleProbe: ReactFlowScaleProbe
    __scaleProbe: ReactFlowScaleProbe
  }
}

const workload = REACT_FLOW_SCALE_WORKLOAD
const view = document.getElementById('view')
if (view === null) throw new Error('缺少 #view')

let renderer: RendererAdapter | null = null
let root: FrameNode | null = null
let viewport: Viewport = { scale: 1, offsetX: 0, offsetY: 0 }
let evidenceFwId: string | null = null

function context(): RenderContext {
  if (root === null) throw new Error('尚未建立 fixture')
  return {
    root,
    viewport,
    // 🔴 必须给：裁剪要靠它算可见区。不给会退化成 DEFAULT_VIEWPORT_SIZE(0×0)，
    // 预裁剪静默失效并把整棵树喂给 React Flow —— 首次做同题对照时就栽在这，
    // 表现是「开了 preCull 却挂载 1000 个」。
    viewportSize: { width: view.clientWidth, height: view.clientHeight },
    selection: [],
    callbacks: {
      ...NOOP_RENDERER_CALLBACKS,
      onViewportChange: (next) => {
        viewport = next
        renderer?.update(context())
      },
    },
  }
}

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

function counts(): { nodes: number; edges: number; minimapNodes: number } {
  return {
    nodes: view.querySelectorAll('[data-fw-id]:not([data-fw-id="scale-fixture-root"])').length,
    edges: view.querySelectorAll('.react-flow__edge').length,
    minimapNodes: view.querySelectorAll('.react-flow__minimap-node').length,
  }
}

async function waitForStableRender(): Promise<ReturnType<typeof counts>> {
  let previous = ''
  let stableFrames = 0
  for (let attempt = 0; attempt < 180; attempt += 1) {
    await nextFrame()
    const current = counts()
    const key = JSON.stringify(current)
    stableFrames = key === previous && current.nodes > 0 ? stableFrames + 1 : 0
    if (stableFrames >= 3) return current
    previous = key
  }
  throw new Error(`180 帧内未稳定：${JSON.stringify(counts())}`)
}

function countFixtureConnections(): number {
  if (root === null) return 0
  return root.children.reduce(
    (total, node) => total + (isAiImageNode(node) || isAiVideoNode(node) ? node.sourceFwIds.length : 0),
    0,
  )
}

function buildFixture(scenario: ZoomOutScenario): FrameNode {
  return createScaleFixture({
    nodeCount: scenario.nodeCount,
    connectionPattern: scenario.connectionPattern,
    seed: workload.seed,
    mediaAssets: CORS_SAFE_PROBE_MEDIA_ASSETS,
  })
}

async function mountScenario(scenario: ZoomOutScenario): Promise<FirstScreenSample> {
  renderer?.destroy()
  view.replaceChildren()
  const fixtureStart = performance.now()
  root = buildFixture(scenario)
  const fixtureBuildMs = performance.now() - fixtureStart
  const initialScale = scenario.initialScale ?? 1
  viewport = { scale: initialScale, offsetX: 0, offsetY: 0 }
  renderer = createReactFlowProbeRenderer({
    miniMap: scenario.miniMap ?? false,
    // 同题对照需要它：默认 false 保持既有行为，场景显式开启才预裁剪。
    preCull: scenario.preCull ?? false,
    onlyRenderVisibleElements: scenario.onlyRenderVisibleElements ?? true,
  })
  const renderStart = performance.now()
  renderer.mount(view, context())
  const mounted = await waitForStableRender()
  const elapsedMs = performance.now() - renderStart
  // 🔴 恒为 0,而这**正是要记下来的事**:三个探针里只有它完全不等图片
  // (DOM 等 decodeMountedImages、Leafer 等证据节点首像素)。
  // 不记成 0 就看不出这份「首屏 ms」少算了一整块工作 —— 口径差异必须留在产物里,
  // 而不是留在谁的记忆里。见 §8.8.1。
  const paintWaitMs = 0
  const totalConnectionCount = countFixtureConnections()

  const evidence = view.querySelector<HTMLElement>('[data-fw-id]:not([data-fw-id="scale-fixture-root"])')
  evidenceFwId = evidence?.dataset.fwId ?? null
  if (evidenceFwId === null) throw new Error('没有可用于拖拽的已挂载节点')

  const viewRect = view.getBoundingClientRect()
  const viewportPixelBudget = viewRect.width * viewRect.height * window.devicePixelRatio ** 2

  return {
    elapsedMs,
    paintWaitMs,
    fixtureBuildMs,
    totalNodeCount: scenario.nodeCount,
    totalConnectionCount,
    evidenceNodeFwId: evidenceFwId,
    mountedLogicalNodeCount: mounted.nodes,
    mountedConnectionCount: mounted.edges,
    connectionLayerPresent: mounted.edges > 0,
    mountedConnectionElementTypes: { path: mounted.edges },
    mountedDomElementCount: view.querySelectorAll('*').length,
    mountedToTotalRatio: mounted.nodes / scenario.nodeCount,
    requestedImageCount: 0,
    decodedImageCount: 0,
    failedImageCount: 0,
    devicePixelRatio: window.devicePixelRatio,
    viewportPixelBudget,
    requestedPixelBudget: 0,
    decodedPixelBudget: 0,
    decodedToViewportRatio: 0,
    maxDisplayStretchRatio: 0,
    maxVisibleStretchRatio: 0,
    decodedImages: [],
  }
}

/** 保留给 run-scale.mjs / run-native.mjs 的 legacy 入口。 */
async function mountLegacy(scenario: LegacyScenario): Promise<Record<string, unknown>> {
  const sample = await mountScenario({
    nodeCount: workload.nodeCount,
    connectionPattern: workload.connectionPattern,
    initialScale: scenario.scale,
    miniMap: scenario.miniMap,
  })
  return {
    ...scenario,
    renderMs: sample.elapsedMs,
    fixtureBuildMs: sample.fixtureBuildMs,
    mountedLogicalNodeCount: sample.mountedLogicalNodeCount,
    mountedEdgeCount: sample.mountedConnectionCount,
    miniMapNodeCount: counts().minimapNodes,
    mountedDomElementCount: sample.mountedDomElementCount,
    totalNodeCount: sample.totalNodeCount,
    mountedToTotalRatio: sample.mountedToTotalRatio,
  }
}

function sampleAnimation(
  ms: number,
  threshold: number,
  update: (progress: number) => void,
): Promise<FrameStats> {
  if (renderer === null) throw new Error('尚未挂载')
  return new Promise((resolve) => {
    const durations: number[] = []
    let start = 0
    let previous = 0
    const tick = (now: number): void => {
      durations.push(now - previous)
      previous = now
      const progress = Math.min(1, (now - start) / ms)
      update(progress)
      renderer?.update(context())
      if (progress < 1) requestAnimationFrame(tick)
      else resolve(buildFrameStats(durations, threshold))
    }
    requestAnimationFrame((now) => {
      start = now
      previous = now
      requestAnimationFrame(tick)
    })
  })
}

function sampleFrames(ms: number, threshold: number): Promise<FrameStats> {
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

let recordedDurations: number[] | null = null
let recordedPrevious = 0

function recordFrame(now: number): void {
  if (recordedDurations === null) return
  recordedDurations.push(now - recordedPrevious)
  recordedPrevious = now
  requestAnimationFrame(recordFrame)
}

function startFrameRecording(): void {
  recordedDurations = []
  recordedPrevious = performance.now()
  requestAnimationFrame(recordFrame)
}

function stopFrameRecording(threshold: number): FrameStats {
  const values = recordedDurations
  recordedDurations = null
  if (values === null) throw new Error('尚未开始帧记录')
  return buildFrameStats(values, threshold)
}

function panePoint(): Point {
  for (let y = 12; y < view.clientHeight - 12; y += 8) {
    for (let x = 12; x < view.clientWidth - 12; x += 8) {
      const element = document.elementFromPoint(x, y)
      if (element?.closest('.react-flow__node, .react-flow__minimap, video') === null) return { x, y }
    }
  }
  throw new Error('找不到未被节点或 MiniMap 覆盖的 pane 坐标')
}

function sampleDrag(ms: number, threshold: number): Promise<FrameStats> {
  if (root === null || evidenceFwId === null) throw new Error('尚未挂载')
  const node = root.children.find((candidate) => candidate.fwId === evidenceFwId)
  if (node === undefined) throw new Error(`${evidenceFwId} 不在 fixture 根节点下`)
  const origin = { x: node.x, y: node.y }
  viewport = { scale: viewport.scale, offsetX: 0, offsetY: 0 }
  renderer?.update(context())
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

function samplePan(
  ms: number,
  threshold: number,
  panDelta: Readonly<{ x: number; y: number }> = workload.panDelta,
): Promise<FrameStats> {
  const scale = viewport.scale
  viewport = { scale, offsetX: 0, offsetY: 0 }
  renderer?.update(context())
  return sampleAnimation(ms, threshold, (progress) => {
    viewport = {
      scale,
      offsetX: panDelta.x * progress,
      offsetY: panDelta.y * progress,
    }
  })
}

function dragSnapshot(): DragSnapshot {
  const node = root?.children.find((candidate) => candidate.fwId === evidenceFwId)
  if (node === undefined) throw new Error('找不到拖拽证据节点')
  return { fwId: node.fwId, x: node.x, y: node.y }
}

function mountedConnectionCount(): number {
  return counts().edges
}

function domNodeSnapshot(): { fwId: string; transform: string; x: number; y: number } {
  if (evidenceFwId === null) throw new Error('没有证据节点')
  const wrapper = view.querySelector(`[data-fw-id="${evidenceFwId}"]`)?.closest<HTMLElement>('.react-flow__node')
  if (wrapper === undefined || wrapper === null) throw new Error('证据节点未挂载')
  const rect = wrapper.getBoundingClientRect()
  return { fwId: evidenceFwId, transform: getComputedStyle(wrapper).transform, x: rect.x, y: rect.y }
}

const probeApi: ReactFlowScaleProbe = {
  mount: mountLegacy,
  mountScenario,
  sampleDrag,
  samplePan,
  dragSnapshot,
  panSnapshot: () => ({ ...viewport }),
  mountedConnectionCount,
  destroy: () => {
    renderer?.destroy()
    renderer = null
    root = null
    evidenceFwId = null
  },
  domNodeSnapshot,
  startFrameRecording,
  stopFrameRecording,
  panePoint,
  sampleFrames,
}

window.__reactFlowScaleProbe = probeApi
window.__scaleProbe = probeApi
