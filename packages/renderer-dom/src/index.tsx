import {
  isFrameNode,
  assertShapeCoverage,
  type CanvasNode,
  type Point,
  type Rect,
  type RenderContext,
  type RendererAdapter,
} from '@framewright/core'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { collectConnectionItems, ConnectionLayer } from './connections'
import {
  createCanvasInteraction,
  EMPTY_INTERACTION_PREVIEW,
  type CanvasInteraction,
  type CanvasInteractionPreview,
} from './canvas-interaction'
import { InteractionOverlay } from './interaction-overlay'
import { DOM_SHAPES } from './shapes/registry'
import { createViewportInteraction, type ViewportInteraction } from './viewport-interaction'

function renderNode(
  node: CanvasNode,
  parentAbsolute: Point,
  parentVisible: boolean,
  selection: readonly string[],
  bounds: Map<string, Rect>,
  visibleNodeIds: string[],
  onNodeAction: RenderContext['callbacks']['onNodeAction'],
  connectionLayer?: ReactNode,
): ReactNode {
  const absolute: Point = { x: parentAbsolute.x + node.x, y: parentAbsolute.y + node.y }
  const position: Point = { x: node.x, y: node.y }
  const visible = parentVisible && node.visible
  bounds.set(node.fwId, {
    x: absolute.x,
    y: absolute.y,
    width: node.width,
    height: node.height,
  })
  if (visible) visibleNodeIds.push(node.fwId)

  const Shape = DOM_SHAPES[node.fwType]
  const children = isFrameNode(node)
    ? (
        <>
          {connectionLayer}
          {node.children.map((child) =>
            renderNode(
              child,
              absolute,
              visible,
              selection,
              bounds,
              visibleNodeIds,
              onNodeAction,
            ),
          )}
        </>
      )
    : undefined

  return (
    <Shape
      key={node.fwId}
      node={node}
      position={position}
      selected={selection.includes(node.fwId)}
      onNodeAction={onNodeAction}
    >
      {children}
    </Shape>
  )
}

export function createDomRenderer(): RendererAdapter {
  assertShapeCoverage('dom', DOM_SHAPES)

  let root: Root | null = null
  let interaction: ViewportInteraction | null = null
  let canvasInteraction: CanvasInteraction | null = null
  let currentContext: RenderContext | null = null
  let interactionPreview: CanvasInteractionPreview = EMPTY_INTERACTION_PREVIEW
  let bounds = new Map<string, Rect>()
  let visibleNodeIds: string[] = []

  const draw = (ctx: RenderContext): void => {
    if (root === null) return
    bounds = new Map<string, Rect>()
    visibleNodeIds = []
    const { scale, offsetX, offsetY } = ctx.viewport
    const rootBounds: Rect = {
      x: ctx.root.x,
      y: ctx.root.y,
      width: ctx.root.width,
      height: ctx.root.height,
    }
    const connectionLayer = (
      <ConnectionLayer
        items={collectConnectionItems(ctx.root)}
        selection={ctx.selection}
        scale={scale}
        rootBounds={rootBounds}
      />
    )
    root.render(
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        <div
          data-fw-viewport="true"
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {renderNode(
            ctx.root,
            { x: 0, y: 0 },
            true,
            ctx.selection,
            bounds,
            visibleNodeIds,
            ctx.callbacks.onNodeAction,
            connectionLayer,
          )}
        </div>
        <InteractionOverlay preview={interactionPreview} viewport={ctx.viewport} />
      </div>,
    )
  }

  return {
    id: 'dom',
    displayName: 'HTML / DOM',

    mount(container, ctx) {
      root = createRoot(container)
      currentContext = ctx
      draw(ctx)
      interaction = createViewportInteraction(container, ctx.viewport, {
        onViewportChange: ctx.callbacks.onViewportChange,
        onPreview: (viewport) => {
          if (currentContext === null) return
          draw({ ...currentContext, viewport })
        },
      })
      canvasInteraction = createCanvasInteraction(container, ctx, {
        onPreview: (preview) => {
          interactionPreview = preview
          if (currentContext !== null) draw(currentContext)
        },
      })
    },

    update(ctx) {
      currentContext = ctx
      interaction?.update(ctx.viewport, ctx.callbacks.onViewportChange)
      canvasInteraction?.update(ctx)
      draw(ctx)
    },

    destroy() {
      interaction?.destroy()
      interaction = null
      canvasInteraction?.destroy()
      canvasInteraction = null
      root?.unmount()
      root = null
      currentContext = null
      interactionPreview = EMPTY_INTERACTION_PREVIEW
      bounds = new Map<string, Rect>()
      visibleNodeIds = []
    },

    getRenderedBounds() {
      return new Map(bounds)
    },

    getVisibleNodeIds() {
      return [...visibleNodeIds]
    },
  }
}
