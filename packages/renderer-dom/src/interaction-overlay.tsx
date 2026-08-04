import { canvasToScreen, type Rect, type Viewport } from '@framewright/core'
import type { CSSProperties, ReactNode } from 'react'
import type { CanvasInteractionPreview } from './canvas-interaction'

interface InteractionOverlayProps {
  preview: CanvasInteractionPreview
  viewport: Viewport
  selectionBounds: ReadonlyArray<{ fwId: string; rect: Rect }>
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

export function InteractionOverlay({
  preview,
  viewport,
  selectionBounds,
}: InteractionOverlayProps): ReactNode {
  const marquee = preview.marquee ?? null
  const singleSelection = selectionBounds.length === 1 ? selectionBounds[0]! : null
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
      {singleSelection === null
        ? null
        : HANDLE_CORNERS.map((corner) => {
            const rect = screenRect(singleSelection.rect, viewport)
            const isRight = corner === 'ne' || corner === 'se'
            const isBottom = corner === 'sw' || corner === 'se'
            return (
              <div
                key={corner}
                data-fw-id={singleSelection.fwId}
                data-fw-resize-handle={corner}
                style={{
                  position: 'absolute',
                  left: isRight ? `calc(${rect.left} + ${rect.width})` : rect.left,
                  top: isBottom ? `calc(${rect.top} + ${rect.height})` : rect.top,
                  width: '8px',
                  height: '8px',
                  border: '1px solid #5B8091',
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
  )
}
