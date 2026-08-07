/**
 * LOD 缩略图尺寸探针的浏览器端。
 *
 * 不依赖产品 renderer，直接用 DOM 模拟「大量小节点进入 LOD 档」的最坏情况：
 * 每个节点一个 div，thumbnailSize=0 时 background 为纯色，>0 时为内联 data URI 缩略图。
 * 这样可以在不改 renderer-dom/src 的情况下，独立回答「多大的缩略图开始变贵」。
 */

import { buildFrameStats, type FrameStats } from './scale-sampling.mjs'

export interface LodThumbnailScenario {
  /** 0 表示纯色，>0 表示正方形缩略图边长（px） */
  readonly thumbnailSize: number
  readonly nodeCount: number
  readonly nodeWidth: number
  readonly nodeHeight: number
  readonly sampleWindowMs: number
  readonly longFrameThresholdMs: number
  readonly panDelta: Readonly<{ x: number; y: number }>
  readonly dragDelta: Readonly<{ x: number; y: number }>
  readonly seed: number
}

interface FirstScreenSample {
  elapsedMs: number
  thumbnailBuildMs: number
  mountMs: number
  totalNodeCount: number
  mountedNodeCount: number
  domElementCount: number
  thumbnailSize: number
}

interface PanSnapshot {
  offsetX: number
  offsetY: number
}

interface DragSnapshot {
  fwId: string
  x: number
  y: number
}

interface LodThumbnailProbe {
  mountScenario(scenario: LodThumbnailScenario): Promise<FirstScreenSample>
  sampleDrag(ms: number, longFrameThresholdMs: number): Promise<FrameStats>
  samplePan(
    ms: number,
    longFrameThresholdMs: number,
    panDelta?: Readonly<{ x: number; y: number }>,
  ): Promise<FrameStats>
  dragSnapshot(): DragSnapshot
  panSnapshot(): PanSnapshot
  destroy(): void
}

declare global {
  interface Window {
    __lodThumbnailProbe: LodThumbnailProbe
  }
}

const view = document.getElementById('view')
if (view === null) throw new Error('缺少 #view')

// 1500 个节点排成规则网格，行列数固定以保证不同缩略图尺寸之间只有单一变量。
const GRID_COLUMNS = 75
const GRID_ROWS = 20
const GAP_X = 4
const GAP_Y = 4

interface NodeDescriptor {
  fwId: string
  x: number
  y: number
  width: number
  height: number
  background: string
}

let nodes: NodeDescriptor[] = []
let nodeElements: HTMLElement[] = []
let scenarioState: LodThumbnailScenario | null = null
let viewportOffset: PanSnapshot = { offsetX: 0, offsetY: 0 }
let evidenceNode: NodeDescriptor | null = null

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

/** 由索引生成确定性的纯色，用于 thumbnailSize=0 或缩略图底色。 */
function solidColorForIndex(index: number): string {
  const hue = (index * 137.5) % 360
  return `hsl(${hue.toFixed(2)}, 60%, 60%)`
}

/** 生成唯一的内联 PNG 缩略图，尺寸为 thumbnailSize × thumbnailSize。 */
function generateThumbnail(thumbnailSize: number, index: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = thumbnailSize
  canvas.height = thumbnailSize
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('无法获取 2D context 生成缩略图')

  const hue = (index * 137.5) % 360
  ctx.fillStyle = `hsl(${hue.toFixed(2)}, 60%, 60%)`
  ctx.fillRect(0, 0, thumbnailSize, thumbnailSize)

  // 加一小块对比色，让小尺寸缩略图也有可辨认内容，而不是单一色块。
  ctx.fillStyle = `hsl(${(hue + 180) % 360}, 80%, 40%)`
  const inner = Math.max(1, Math.floor(thumbnailSize * 0.35))
  const offset = Math.floor((thumbnailSize - inner) / 2)
  ctx.fillRect(offset, offset, inner, inner)

  return canvas.toDataURL('image/png')
}

function buildNodes(scenario: LodThumbnailScenario): NodeDescriptor[] {
  if (scenario.nodeCount !== GRID_COLUMNS * GRID_ROWS) {
    throw new Error(
      `本探针固定 ${GRID_COLUMNS * GRID_ROWS} 节点网格，收到 ${scenario.nodeCount}`,
    )
  }

  const built: NodeDescriptor[] = []
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLUMNS; col += 1) {
      const index = row * GRID_COLUMNS + col
      const background = scenario.thumbnailSize === 0
        ? solidColorForIndex(index)
        : generateThumbnail(scenario.thumbnailSize, index)
      built.push({
        fwId: `node-${index}`,
        x: col * (scenario.nodeWidth + GAP_X),
        y: row * (scenario.nodeHeight + GAP_Y),
        width: scenario.nodeWidth,
        height: scenario.nodeHeight,
        background,
      })
    }
  }
  return built
}

function createNodeElement(node: NodeDescriptor): HTMLElement {
  const element = document.createElement('div')
  element.dataset.fwId = node.fwId
  element.style.position = 'absolute'
  element.style.left = '0px'
  element.style.top = '0px'
  element.style.width = `${node.width}px`
  element.style.height = `${node.height}px`
  // 纯色用 backgroundColor；data URI 缩略图必须包进 url(...) 才是合法 CSS image。
  if (node.background.startsWith('data:')) {
    element.style.backgroundImage = `url("${node.background}")`
  } else {
    element.style.backgroundColor = node.background
  }
  element.style.backgroundSize = 'cover'
  element.style.willChange = 'transform'
  element.style.transform = `translate3d(${node.x}px, ${node.y}px, 0)`
  return element
}

function updateNodeTransforms(): void {
  for (let index = 0; index < nodeElements.length; index += 1) {
    const node = nodes[index]
    const element = nodeElements[index]
    element.style.transform = `translate3d(${node.x + viewportOffset.offsetX}px, ${node.y + viewportOffset.offsetY}px, 0)`
  }
}

function sampleAnimation(
  ms: number,
  longFrameThresholdMs: number,
  update: (progress: number) => void,
): Promise<FrameStats> {
  return new Promise((resolve) => {
    const frameDurations: number[] = []
    let last = 0
    let start = 0
    const tick = (now: number): void => {
      frameDurations.push(now - last)
      last = now
      const progress = Math.min(1, (now - start) / ms)
      update(progress)
      if (progress < 1) {
        requestAnimationFrame(tick)
      } else {
        resolve(buildFrameStats(frameDurations, longFrameThresholdMs))
      }
    }
    requestAnimationFrame((now) => {
      start = now
      last = now
      requestAnimationFrame(tick)
    })
  })
}

async function mountScenario(scenario: LodThumbnailScenario): Promise<FirstScreenSample> {
  destroy()
  scenarioState = scenario
  viewportOffset = { offsetX: 0, offsetY: 0 }

  const start = performance.now()
  nodes = buildNodes(scenario)
  const thumbnailBuildMs = performance.now() - start

  nodeElements = nodes.map(createNodeElement)
  for (const element of nodeElements) {
    view.appendChild(element)
  }
  await waitForMountedNodes()
  const mountMs = performance.now() - start - thumbnailBuildMs
  const elapsedMs = performance.now() - start

  evidenceNode = nodes[0]
  if (evidenceNode === undefined) throw new Error('场景中没有节点可作为拖拽旁证')

  return {
    elapsedMs,
    thumbnailBuildMs,
    mountMs,
    totalNodeCount: nodes.length,
    mountedNodeCount: nodeElements.length,
    domElementCount: view.querySelectorAll('*').length,
    thumbnailSize: scenario.thumbnailSize,
  }
}

async function sampleDrag(ms: number, longFrameThresholdMs: number): Promise<FrameStats> {
  if (evidenceNode === null) throw new Error('尚未挂载场景')
  const node = evidenceNode
  const originX = node.x
  const originY = node.y
  const dragDelta = scenarioState?.dragDelta ?? { x: 60, y: 40 }
  const evidenceElement = nodeElements[0]
  if (evidenceElement === undefined) throw new Error('拖拽旁证节点未挂载')

  return sampleAnimation(ms, longFrameThresholdMs, (progress) => {
    node.x = originX + dragDelta.x * progress
    node.y = originY + dragDelta.y * progress
    evidenceElement.style.transform = `translate3d(${node.x + viewportOffset.offsetX}px, ${node.y + viewportOffset.offsetY}px, 0)`
  })
}

async function samplePan(
  ms: number,
  longFrameThresholdMs: number,
  panDelta: Readonly<{ x: number; y: number }> = scenarioState?.panDelta ?? { x: -600, y: 0 },
): Promise<FrameStats> {
  viewportOffset = { offsetX: 0, offsetY: 0 }
  updateNodeTransforms()

  return sampleAnimation(ms, longFrameThresholdMs, (progress) => {
    viewportOffset = {
      offsetX: panDelta.x * progress,
      offsetY: panDelta.y * progress,
    }
    updateNodeTransforms()
  })
}

function dragSnapshot(): DragSnapshot {
  if (evidenceNode === null) throw new Error('尚未挂载场景')
  return { fwId: evidenceNode.fwId, x: evidenceNode.x, y: evidenceNode.y }
}

function panSnapshot(): PanSnapshot {
  return { ...viewportOffset }
}

function destroy(): void {
  view.replaceChildren()
  nodes = []
  nodeElements = []
  scenarioState = null
  viewportOffset = { offsetX: 0, offsetY: 0 }
  evidenceNode = null
}

window.__lodThumbnailProbe = {
  mountScenario,
  sampleDrag,
  samplePan,
  dragSnapshot,
  panSnapshot,
  destroy,
}
