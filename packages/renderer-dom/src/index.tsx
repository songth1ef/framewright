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
  type NodeResize,
} from './canvas-interaction'
import { InteractionOverlay } from './interaction-overlay'
import { DOM_SHAPES } from './shapes/registry'
import { createViewportInteraction, type ViewportInteraction } from './viewport-interaction'

function renderNode(
  node: CanvasNode,
  parentAbsolute: Point,
  parentVisible: boolean,
  selection: readonly string[],
  previewMoves: ReadonlyMap<string, { x: number; y: number }>,
  previewResizes: ReadonlyMap<string, NodeResize>,
  bounds: Map<string, Rect>,
  visibleNodeIds: string[],
  onNodeAction: RenderContext['callbacks']['onNodeAction'],
  connectionLayer?: ReactNode,
): ReactNode {
  const previewResize = previewResizes.get(node.fwId)
  const previewPosition = previewMoves.get(node.fwId)
  const position: Point = previewResize ?? previewPosition ?? { x: node.x, y: node.y }
  const size = previewResize ?? { width: node.width, height: node.height }
  const absolute: Point = { x: parentAbsolute.x + position.x, y: parentAbsolute.y + position.y }
  const visible = parentVisible && node.visible
  bounds.set(node.fwId, {
    x: absolute.x,
    y: absolute.y,
    width: size.width,
    height: size.height,
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
              previewMoves,
              previewResizes,
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
      size={size}
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
    const previewMoves = new Map(
      (interactionPreview.moves ?? []).map((move) => [move.fwId, { x: move.x, y: move.y }]),
    )
    const previewResizes = new Map(
      (interactionPreview.resizes ?? []).map((resize) => [resize.fwId, resize]),
    )
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
            previewMoves,
            previewResizes,
            bounds,
            visibleNodeIds,
            ctx.callbacks.onNodeAction,
            connectionLayer,
          )}
        </div>
        <InteractionOverlay
          preview={interactionPreview}
          viewport={ctx.viewport}
          selectionBounds={ctx.selection.flatMap((fwId) => {
            const rect = bounds.get(fwId)
            return rect === undefined ? [] : [{ fwId, rect }]
          })}
        />
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
