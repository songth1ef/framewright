import React, { type CSSProperties, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import {
  DOM_SCALE_PROBE_WORKLOAD,
  type DomScaleProbeScenario,
} from '../probe-config.mjs'
import type { DragSnapshot, ZoomSnapshot } from './scale-sampling.mjs'

interface Point { x: number; y: number }
interface Edge { from: number; to: number }
interface FpsSample { frames: number; elapsedMs: number; fps: number; longFrames: number }
interface FirstScreenSample {
  elapsedMs: number
  mountedNodeCount: number
  mountedConnectionCount: number
  visibleNodeCount: number
}

interface DomScaleProbe {
  mountScenario(scenario: DomScaleProbeScenario): Promise<FirstScreenSample>
  sampleDrag(ms: number, longFrameThresholdMs: number): Promise<FpsSample>
  sampleZoom(ms: number, longFrameThresholdMs: number): Promise<FpsSample>
  dragSnapshot(): DragSnapshot
  zoomSnapshot(): ZoomSnapshot
}

declare global {
  interface Window { __scaleProbe: DomScaleProbe }
}

function requireView(): HTMLElement {
  const element = document.getElementById('view')
  if (element === null) throw new Error('缺少 #view')
  return element
}

const workload = DOM_SCALE_PROBE_WORKLOAD
const view = requireView()
const root: Root = createRoot(view)
let scenario: DomScaleProbeScenario | null = null
let positions: Point[] = []
let edges: Edge[] = []
let scale = workload.zoom.startScale

function makePositions(count: number): Point[] {
  const { columns, originX, originY, gapX, gapY } = workload.layout
  return Array.from({ length: count }, (_, index) => ({
    x: originX + (index % columns) * (workload.nodeSize.width + gapX),
    y: originY + Math.floor(index / columns) * (workload.nodeSize.height + gapY),
  }))
}

function makeEdges(value: DomScaleProbeScenario): Edge[] {
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

function ProbeCanvas(): ReactNode {
  if (scenario === null) return null
  const worldWidth = workload.layout.originX * 2 + workload.layout.columns *
    (workload.nodeSize.width + workload.layout.gapX)
  const rows = Math.ceil(scenario.nodeCount / workload.layout.columns)
  const worldHeight = workload.layout.originY * 2 + rows *
    (workload.nodeSize.height + workload.layout.gapY)
  const viewportStyle: CSSProperties = {
    position: 'relative',
    width: `${worldWidth}px`,
    height: `${worldHeight}px`,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
  }
  return (
    <div data-probe-viewport="true" style={viewportStyle}>
      <svg
        data-probe-connections="true"
        viewBox={`0 0 ${worldWidth} ${worldHeight}`}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}
      >
        {edges.map((edge, index) => (
          <path
            key={`${edge.from}:${edge.to}:${index}`}
            data-probe-connection={index}
            d={connectionPath(edge)}
            fill="none"
            stroke="#78909c"
            strokeWidth={2 / scale}
          />
        ))}
      </svg>
      {positions.map((position, index) => (
        <div
          key={index}
          data-probe-node={index}
          style={{
            position: 'absolute',
            left: `${position.x}px`,
            top: `${position.y}px`,
            width: `${workload.nodeSize.width}px`,
            height: `${workload.nodeSize.height}px`,
            boxSizing: 'border-box',
            border: '1px solid #455a64',
            borderRadius: '4px',
            background: index === 0 ? '#90caf9' : '#cfd8dc',
          }}
        />
      ))}
    </div>
  )
}

function commit(): void {
  flushSync(() => root.render(<ProbeCanvas />))
}

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

async function mountScenario(value: DomScaleProbeScenario): Promise<FirstScreenSample> {
  const start = performance.now()
  scenario = value
  positions = makePositions(value.nodeCount)
  edges = makeEdges(value)
  scale = workload.zoom.startScale
  commit()
  await nextFrame()

  const nodes = Array.from(view.querySelectorAll<HTMLElement>('[data-probe-node]'))
  const connections = view.querySelectorAll('[data-probe-connection]')
  if (nodes.length !== value.nodeCount || connections.length !== value.connectionCount) {
    throw new Error(`首屏挂载计数不符：nodes=${nodes.length}, connections=${connections.length}`)
  }
  const viewRect = view.getBoundingClientRect()
  const visibleNodeCount = nodes.filter((node) => {
    const rect = node.getBoundingClientRect()
    return rect.right > viewRect.left && rect.left < viewRect.right && rect.bottom > viewRect.top && rect.top < viewRect.bottom
  }).length
  if (visibleNodeCount === 0) throw new Error('首屏完成时没有节点进入可见区')
  return {
    elapsedMs: performance.now() - start,
    mountedNodeCount: nodes.length,
    mountedConnectionCount: connections.length,
    visibleNodeCount,
  }
}

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
      commit()
      if (progress < 1) requestAnimationFrame(tick)
      else resolve({ frames, elapsedMs: now - start, fps: (frames / (now - start)) * 1000, longFrames })
    }
    requestAnimationFrame(tick)
  })
}

async function sampleDrag(ms: number, threshold: number): Promise<FpsSample> {
  const start = positions[0]
  if (start === undefined) throw new Error('没有可拖拽节点')
  const origin = { ...start }
  return sampleAnimation(ms, threshold, (progress) => {
    positions[0] = {
      x: origin.x + workload.dragDelta.x * progress,
      y: origin.y + workload.dragDelta.y * progress,
    }
  })
}

async function sampleZoom(ms: number, threshold: number): Promise<FpsSample> {
  scale = workload.zoom.startScale
  commit()
  return sampleAnimation(ms, threshold, (progress) => {
    scale = workload.zoom.startScale +
      (workload.zoom.endScale - workload.zoom.startScale) * progress
  })
}

function dragSnapshot(): DragSnapshot {
  const position = positions[0]
  if (position === undefined) throw new Error('没有可记录的拖拽节点')
  return { fwId: 'box-0', x: position.x, y: position.y }
}

function zoomSnapshot(): ZoomSnapshot {
  return { scale }
}

window.__scaleProbe = { mountScenario, sampleDrag, sampleZoom, dragSnapshot, zoomSnapshot }
