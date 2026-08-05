'use client'

import type { FrameNode, Rect, Viewport } from '@framewright/core'
import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react'
import {
  MINIMAP_GRID_COLUMNS,
  MINIMAP_GRID_ROWS,
  MINIMAP_HEIGHT,
  MINIMAP_PADDING,
  MINIMAP_WIDTH,
  createMinimapDensity,
  createMinimapProjection,
  mapMinimapPointToCanvas,
  projectViewportFrame,
  viewportCenteredAt,
  type MinimapDensity,
} from './minimap'
import type { ViewportSize } from './viewport-actions'

function drawDensity(canvas: HTMLCanvasElement, density: MinimapDensity): void {
  canvas.width = MINIMAP_GRID_COLUMNS
  canvas.height = MINIMAP_GRID_ROWS
  const context = canvas.getContext('2d')
  if (context === null) return
  const image = context.createImageData(MINIMAP_GRID_COLUMNS, MINIMAP_GRID_ROWS)
  const denominator = Math.log2(density.maxCount + 1) || 1
  density.cells.forEach((count, index) => {
    if (count === 0) return
    const intensity = Math.log2(count + 1) / denominator
    const offset = index * 4
    image.data[offset] = 80
    image.data[offset + 1] = Math.round(125 + intensity * 65)
    image.data[offset + 2] = 220
    image.data[offset + 3] = Math.round(80 + intensity * 175)
  })
  context.putImageData(image, 0, 0)
}

const panelStyle: CSSProperties = {
  position: 'absolute', left: 12, bottom: 12, zIndex: 4,
  width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT,
  overflow: 'hidden', border: '1px solid rgba(52, 64, 84, 0.48)', borderRadius: 10,
  background: 'rgba(248, 250, 252, 0.94)', boxShadow: '0 4px 14px rgba(16, 24, 40, 0.18)',
  cursor: 'crosshair', touchAction: 'none', userSelect: 'none',
}

const toggleStyle: CSSProperties = {
  position: 'absolute', left: 12, bottom: 12, zIndex: 4, height: 30,
  padding: '0 10px', border: '1px solid #98a2b3', borderRadius: 8,
  color: '#344054', background: 'rgba(255, 255, 255, 0.94)',
  boxShadow: '0 2px 8px rgba(16, 24, 40, 0.12)', cursor: 'pointer',
  font: '12px system-ui, sans-serif',
}

export function MinimapToggle({ onOpen }: { onOpen(): void }): ReactElement {
  return (
    <button type="button" data-testid="minimap-toggle" style={toggleStyle} onClick={onOpen}>
      显示缩略图
    </button>
  )
}

export function Minimap({
  root,
  bounds,
  viewport,
  viewportSize,
  onViewportChange,
  onClose,
}: {
  root: FrameNode
  bounds: Rect
  viewport: Viewport
  viewportSize: ViewportSize
  onViewportChange(next: Viewport): void
  onClose(): void
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointerIdRef = useRef<number | null>(null)
  const projection = useMemo(
    () => createMinimapProjection(bounds, { width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }, MINIMAP_PADDING),
    [bounds],
  )
  const density = useMemo(
    () => createMinimapDensity(root, bounds, MINIMAP_GRID_COLUMNS, MINIMAP_GRID_ROWS),
    [root, bounds],
  )
  const frame = projectViewportFrame(viewport, viewportSize, projection)

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas !== null) drawDensity(canvas, density)
  }, [density])

  const jump = (event: ReactPointerEvent<HTMLElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    const point = {
      x: ((event.clientX - rect.left) / rect.width) * MINIMAP_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * MINIMAP_HEIGHT,
    }
    onViewportChange(viewportCenteredAt(mapMinimapPointToCanvas(point, projection), viewport, viewportSize))
  }

  return (
    <section
      aria-label="画布缩略图，点击或拖拽可跳转"
      data-testid="minimap"
      style={panelStyle}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        pointerIdRef.current = event.pointerId
        event.currentTarget.setPointerCapture(event.pointerId)
        jump(event)
      }}
      onPointerMove={(event) => {
        if (pointerIdRef.current === event.pointerId) jump(event)
      }}
      onPointerUp={(event) => {
        if (pointerIdRef.current !== event.pointerId) return
        pointerIdRef.current = null
        event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={() => {
        pointerIdRef.current = null
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        data-testid="minimap-density-canvas"
        style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }}
      />
      <div
        data-testid="minimap-viewport"
        style={{
          position: 'absolute', left: frame.left, top: frame.top,
          width: frame.width, height: frame.height, boxSizing: 'border-box',
          border: '2px solid #155eef', background: 'rgba(21, 94, 239, 0.08)', pointerEvents: 'none',
        }}
      />
      <button
        type="button"
        aria-label="隐藏缩略图"
        data-testid="minimap-toggle"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onClose}
        style={{
          position: 'absolute', top: 6, right: 6, width: 24, height: 24, padding: 0,
          border: '1px solid rgba(52, 64, 84, 0.32)', borderRadius: 6,
          color: '#344054', background: 'rgba(255, 255, 255, 0.88)', cursor: 'pointer',
        }}
      >
        ×
      </button>
    </section>
  )
}
