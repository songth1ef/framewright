'use client'

import type { FrameNode, Rect, Viewport } from '@framewright/core'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react'
import {
  MINIMAP_HEIGHT,
  MINIMAP_PADDING,
  MINIMAP_WIDTH,
  createMinimapDrawItems,
  createMinimapProjection,
  getMinimapVisual,
  mapMinimapPointToCanvas,
  projectViewportFrame,
  shouldDrawMinimapIcon,
  viewportCenteredAt,
  type MinimapDrawItem,
  type MinimapIcon,
} from './minimap'
import type { ViewportSize } from './viewport-actions'

function drawIcon(
  context: CanvasRenderingContext2D,
  icon: Exclude<MinimapIcon, null>,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  const centerX = left + width / 2
  const centerY = top + height / 2
  const radius = Math.min(width, height) * 0.28
  context.fillStyle = 'rgba(255, 255, 255, 0.92)'
  context.strokeStyle = 'rgba(255, 255, 255, 0.92)'
  context.lineWidth = Math.max(1, Math.min(width, height) * 0.08)
  context.lineCap = 'round'
  context.lineJoin = 'round'

  if (icon === 'video') {
    context.beginPath()
    context.moveTo(centerX - radius * 0.65, centerY - radius)
    context.lineTo(centerX + radius, centerY)
    context.lineTo(centerX - radius * 0.65, centerY + radius)
    context.closePath()
    context.fill()
    return
  }
  if (icon === 'audio') {
    context.beginPath()
    context.moveTo(centerX + radius * 0.55, centerY - radius)
    context.lineTo(centerX + radius * 0.55, centerY + radius * 0.45)
    context.lineTo(centerX - radius * 0.5, centerY + radius * 0.7)
    context.stroke()
    context.beginPath()
    context.arc(centerX - radius * 0.72, centerY + radius * 0.72, radius * 0.35, 0, Math.PI * 2)
    context.arc(centerX + radius * 0.32, centerY + radius * 0.45, radius * 0.35, 0, Math.PI * 2)
    context.fill()
    return
  }

  context.beginPath()
  context.moveTo(centerX - radius, centerY + radius * 0.7)
  context.lineTo(centerX - radius * 0.25, centerY - radius * 0.1)
  context.lineTo(centerX + radius * 0.2, centerY + radius * 0.35)
  context.lineTo(centerX + radius, centerY - radius * 0.5)
  context.stroke()
  context.beginPath()
  context.arc(centerX - radius * 0.45, centerY - radius * 0.55, radius * 0.22, 0, Math.PI * 2)
  context.fill()
}

function drawItems(
  canvas: HTMLCanvasElement,
  items: readonly MinimapDrawItem[],
  projection: ReturnType<typeof createMinimapProjection>,
): void {
  canvas.width = MINIMAP_WIDTH
  canvas.height = MINIMAP_HEIGHT
  const context = canvas.getContext('2d')
  if (context === null) return
  context.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT)
  for (const item of items) {
    const visual = getMinimapVisual(item.fwType)
    const left = item.x * projection.scale + projection.offsetX
    const top = item.y * projection.scale + projection.offsetY
    const width = item.width * projection.scale
    const height = item.height * projection.scale
    context.globalAlpha = item.opacity
    context.fillStyle = visual.color
    context.fillRect(left, top, width, height)
    if (visual.icon !== null && shouldDrawMinimapIcon(width, height)) {
      if (visual.icon === 'image') drawIcon(context, 'image', left, top, width, height)
      if (visual.icon === 'video') drawIcon(context, 'video', left, top, width, height)
      if (visual.icon === 'audio') drawIcon(context, 'audio', left, top, width, height)
    }
  }
  context.globalAlpha = 1
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
  onViewportChange,
  onClose,
}: {
  root: FrameNode
  bounds: Rect
  viewport: Viewport
  onViewportChange(next: Viewport): void
  onClose(): void
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const pointerIdRef = useRef<number | null>(null)
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 800, height: 450 })
  const projection = useMemo(
    () => createMinimapProjection(bounds, { width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }, MINIMAP_PADDING),
    [bounds],
  )
  const items = useMemo(() => createMinimapDrawItems(root), [root])
  const frame = projectViewportFrame(viewport, viewportSize, projection)

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas !== null) drawItems(canvas, items, projection)
  }, [items, projection])

  useEffect(() => {
    const viewportElement = panelRef.current?.parentElement
    if (viewportElement === null || viewportElement === undefined) return
    const updateSize = (): void => {
      setViewportSize({ width: viewportElement.clientWidth, height: viewportElement.clientHeight })
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(viewportElement)
    return () => observer.disconnect()
  }, [])

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
      ref={panelRef}
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
        data-testid="minimap-content-canvas"
        style={{ width: '100%', height: '100%' }}
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
