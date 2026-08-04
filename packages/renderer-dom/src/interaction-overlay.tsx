import { canvasToScreen, type Rect, type Viewport } from '@framewright/core'
import type { CSSProperties, ReactNode } from 'react'
import type { CanvasInteractionPreview } from './canvas-interaction'

interface InteractionOverlayProps {
  preview: CanvasInteractionPreview
  viewport: Viewport
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

export function InteractionOverlay({ preview, viewport }: InteractionOverlayProps): ReactNode {
  const marquee = preview.marquee ?? null
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
    </div>
  )
}
