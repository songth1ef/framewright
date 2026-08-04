import { canvasToScreen, type Rect, type Viewport } from '@framewright/core'
import type { CSSProperties, ReactNode } from 'react'
import type { CanvasInteractionPreview } from './canvas-interaction'

interface InteractionOverlayProps {
  preview: CanvasInteractionPreview
  viewport: Viewport
  selectionBounds: ReadonlyArray<{ fwId: string; rect: Rect }>
  hoverBounds: { fwId: string; rect: Rect } | null
}

function screenRect(rect: Rect, viewport: Viewport): CSSProperties {
  const origin = canvasToScreen(viewport, { x: rect.x, y: rect.y })
  return {
    position: 'absolute',
    left: `${origin.x}px`,
    top: `${origin.y}px`,
    width: `${rect.width * viewport.scale}px`,
    height: `${rect.height * viewport.scale}px`,
    boxSizing: 'border-box',
  }
}

const HANDLE_CORNERS = ['nw', 'ne', 'sw', 'se'] as const

const HANDLE_CURSOR = {
  nw: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  se: 'nwse-resize',
} as const

function unionRects(items: ReadonlyArray<{ rect: Rect }>): Rect | null {
  if (items.length === 0) return null
  const first = items[0]!.rect
  let left = first.x
  let top = first.y
  let right = first.x + first.width
  let bottom = first.y + first.height
  for (const { rect } of items.slice(1)) {
    left = Math.min(left, rect.x)
    top = Math.min(top, rect.y)
    right = Math.max(right, rect.x + rect.width)
    bottom = Math.max(bottom, rect.y + rect.height)
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function canvasRect(rect: Rect): CSSProperties {
  return {
    position: 'absolute',
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    boxSizing: 'border-box',
  }
}

export function InteractionOverlay({
  preview,
  viewport,
  selectionBounds,
  hoverBounds,
}: InteractionOverlayProps): ReactNode {
  const marquee = preview.marquee ?? null
  const singleSelection = selectionBounds.length === 1 ? selectionBounds[0]! : null
  const selectionRect = unionRects(selectionBounds)
  const inverseScale = 1 / viewport.scale
  return (
    <div
      data-fw-interaction-overlay="true"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      {marquee === null ? null : (
        <div
          data-fw-selection-marquee="true"
          style={{
            ...screenRect(marquee, viewport),
            border: '1px solid #5B8091',
            background: 'rgba(91, 128, 145, 0.15)',
          }}
        />
      )}
      <div
        data-fw-canvas-overlay="true"
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
        }}
      >
        {hoverBounds === null ? null : (
          <div
            data-fw-hover-outline="true"
            style={{
              ...canvasRect(hoverBounds.rect),
              borderStyle: 'solid',
              borderWidth: `${inverseScale}px`,
              borderColor: 'rgba(91, 128, 145, 0.45)',
            }}
          />
        )}
        {selectionRect === null ? null : (
          <div
            data-fw-selection-outline={singleSelection === null ? 'group' : 'single'}
            style={{
              ...canvasRect(selectionRect),
              borderStyle: 'solid',
              borderWidth: `${2 * inverseScale}px`,
              borderColor: '#5B8091',
            }}
          />
        )}
        {singleSelection === null
          ? null
          : HANDLE_CORNERS.map((corner) => {
              const isRight = corner === 'ne' || corner === 'se'
              const isBottom = corner === 'sw' || corner === 'se'
              return (
                <div
                  key={corner}
                  data-fw-id={singleSelection.fwId}
                  data-fw-resize-handle={corner}
                  style={{
                    position: 'absolute',
                    left: `${singleSelection.rect.x + (isRight ? singleSelection.rect.width : 0)}px`,
                    top: `${singleSelection.rect.y + (isBottom ? singleSelection.rect.height : 0)}px`,
                    width: `${8 * inverseScale}px`,
                    height: `${8 * inverseScale}px`,
                    border: `${inverseScale}px solid #5B8091`,
                    background: '#FFFFFF',
                    boxSizing: 'border-box',
                    cursor: HANDLE_CURSOR[corner],
                    pointerEvents: 'auto',
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              )
            })}
      </div>
    </div>
  )
}
