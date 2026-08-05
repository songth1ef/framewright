import {
  NOOP_RENDERER_CALLBACKS,
  applyNodeMoves,
  createScaleFixture,
  type FrameNode,
  type Point,
  type RenderContext,
  type RendererAdapter,
  type Viewport,
} from '@framewright/core'
import { createReactFlowProbeRenderer } from '../../src/index'
import { REACT_FLOW_SCALE_WORKLOAD } from '../probe-config.mjs'
import { buildFrameStats, type FrameStats } from './sampling.mjs'

interface Scenario { scale: number; miniMap: boolean }
interface Snapshot { fwId: string; x: number; y: number }

interface ScaleProbe {
  mount(scenario: Scenario): Promise<Record<string, unknown>>
  sampleDrag(ms: number, threshold: number): Promise<FrameStats>
  samplePan(ms: number, threshold: number): Promise<FrameStats>
  sampleFrames(ms: number, threshold: number): Promise<FrameStats>
  startFrameRecording(): void
  stopFrameRecording(threshold: number): FrameStats
  panePoint(): Point
  dragSnapshot(): Snapshot
  domNodeSnapshot(): { fwId: string; transform: string; x: number; y: number }
  panSnapshot(): Viewport
  destroy(): void
}

declare global { interface Window { __reactFlowScaleProbe: ScaleProbe } }

const workload = REACT_FLOW_SCALE_WORKLOAD
const view = document.getElementById('view')
if (view === null) throw new Error('缺少 #view')

let renderer: RendererAdapter | null = null
let root: FrameNode | null = null
let viewport: Viewport = { scale: 1, offsetX: 0, offsetY: 0 }
let evidenceFwId: string | null = null
let recordedDurations: number[] | null = null
let recordedPrevious = 0

function context(): RenderContext {
  if (root === null) throw new Error('尚未建立 fixture')
  return {
    root,
    viewport,
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

async function mount(scenario: Scenario): Promise<Record<string, unknown>> {
  renderer?.destroy()
  view.replaceChildren()
  const fixtureStart = performance.now()
  root = createScaleFixture({
    nodeCount: workload.nodeCount,
    connectionPattern: workload.connectionPattern,
    seed: workload.seed,
  })
  const fixtureBuildMs = performance.now() - fixtureStart
  viewport = { scale: scenario.scale, offsetX: 0, offsetY: 0 }
  renderer = createReactFlowProbeRenderer({ miniMap: scenario.miniMap })
  const renderStart = performance.now()
  renderer.mount(view, context())
  const mounted = await waitForStableRender()
  const renderMs = performance.now() - renderStart
  const evidence = view.querySelector<HTMLElement>('[data-fw-id]:not([data-fw-id="scale-fixture-root"])')
  evidenceFwId = evidence?.dataset.fwId ?? null
  if (evidenceFwId === null) throw new Error('没有可用于拖拽的已挂载节点')
  return {
    ...scenario,
    fixtureBuildMs,
    renderMs,
    mountedLogicalNodeCount: mounted.nodes,
    mountedEdgeCount: mounted.edges,
    miniMapNodeCount: mounted.minimapNodes,
    mountedDomElementCount: view.querySelectorAll('*').length,
    totalNodeCount: workload.nodeCount,
    mountedToTotalRatio: mounted.nodes / workload.nodeCount,
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

function samplePan(ms: number, threshold: number): Promise<FrameStats> {
  const scale = viewport.scale
  viewport = { scale, offsetX: 0, offsetY: 0 }
  renderer?.update(context())
  return sampleAnimation(ms, threshold, (progress) => {
    viewport = {
      scale,
      offsetX: workload.panDelta.x * progress,
      offsetY: workload.panDelta.y * progress,
    }
  })
}

function dragSnapshot(): Snapshot {
  const node = root?.children.find((candidate) => candidate.fwId === evidenceFwId)
  if (node === undefined) throw new Error('找不到拖拽证据节点')
  return { fwId: node.fwId, x: node.x, y: node.y }
}

window.__reactFlowScaleProbe = {
  mount,
  sampleDrag,
  samplePan,
  sampleFrames,
  startFrameRecording,
  stopFrameRecording,
  panePoint,
  dragSnapshot,
  domNodeSnapshot: () => {
    if (evidenceFwId === null) throw new Error('没有证据节点')
    const wrapper = view.querySelector(`[data-fw-id="${evidenceFwId}"]`)?.closest<HTMLElement>('.react-flow__node')
    if (wrapper === undefined || wrapper === null) throw new Error('证据节点未挂载')
    const rect = wrapper.getBoundingClientRect()
    return { fwId: evidenceFwId, transform: getComputedStyle(wrapper).transform, x: rect.x, y: rect.y }
  },
  panSnapshot: () => ({ ...viewport }),
  destroy: () => {
    renderer?.destroy()
    renderer = null
    root = null
    evidenceFwId = null
  },
}
