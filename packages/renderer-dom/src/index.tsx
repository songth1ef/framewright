import {
  findNodeById,
  getConnectionsInViewport,
  getNodesInViewport,
  getViewportLod,
  isAiImageNode,
  isAiVideoNode,
  isFrameNode,
  resolveViewportCullingLimits,
  resolveViewportSize,
  assertShapeCoverage,
  type CanvasNode,
  type Point,
  type Rect,
  type RenderContext,
  type RendererAdapter,
  type ViewportDetailLevel,
} from '@framewright/core'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ConnectionLayer } from './connections'
import {
  createCanvasInteraction,
  EMPTY_INTERACTION_PREVIEW,
  type CanvasInteraction,
  type CanvasCursor,
  type CanvasInteractionPreview,
  type NodeResize,
} from './canvas-interaction'
import { InteractionOverlay } from './interaction-overlay'
import { RendererStyles } from './renderer-styles'
import { GenerationUnitToolbar } from './shapes/generation-unit'
import { DOM_SHAPES, LodShape } from './shapes/registry'
import { createViewportInteraction, type ViewportInteraction } from './viewport-interaction'

export {
  createVideoPlaybackSessionWriteAction,
  parseVideoPlaybackSessionAction,
  type VideoPlaybackSessionState,
} from './video-playback-session-channel'

function renderNode(
  node: CanvasNode,
  parentAbsolute: Point,
  parentVisible: boolean,
  selection: readonly string[],
  previewMoves: ReadonlyMap<string, { x: number; y: number }>,
  previewResizes: ReadonlyMap<string, NodeResize>,
  mountedNodeIds: ReadonlySet<string>,
  videoVisibleNodeIds: ReadonlySet<string>,
  onNodeAction: RenderContext['callbacks']['onNodeAction'],
  onNodesDelete: RenderContext['callbacks']['onNodesDelete'],
  activeVideoFwId: string | null,
  detail: ViewportDetailLevel,
  viewportScale: number,
  parentRotation: number,
  connectionLayer?: ReactNode,
): ReactNode {
  if (!mountedNodeIds.has(node.fwId)) return null

  const previewResize = previewResizes.get(node.fwId)
  const previewPosition = previewMoves.get(node.fwId)
  const position: Point = previewResize ?? previewPosition ?? { x: node.x, y: node.y }
  const size = previewResize ?? { width: node.width, height: node.height }
  const absolute: Point = { x: parentAbsolute.x + position.x, y: parentAbsolute.y + position.y }
  const cumulativeRotation = parentRotation + node.rotation
  const visible = parentVisible && node.visible
  const Shape = detail === 'full' ? DOM_SHAPES[node.fwType] : LodShape
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
              mountedNodeIds,
              videoVisibleNodeIds,
              onNodeAction,
              onNodesDelete,
              activeVideoFwId,
              detail,
              viewportScale,
              cumulativeRotation,
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
      active={node.fwId === activeVideoFwId}
      detail={detail}
      viewportScale={viewportScale}
      cumulativeRotation={cumulativeRotation}
      videoVisible={videoVisibleNodeIds.has(node.fwId)}
      onNodeAction={onNodeAction}
      onNodesDelete={onNodesDelete}
    >
      {children}
    </Shape>
  )
}

function collectRenderMetrics(
  node: CanvasNode,
  parentAbsolute: Point,
  parentVisible: boolean,
  previewMoves: ReadonlyMap<string, Point>,
  previewResizes: ReadonlyMap<string, NodeResize>,
  bounds: Map<string, Rect>,
  visibleNodeIds: string[],
): void {
  const previewResize = previewResizes.get(node.fwId)
  const position = previewResize ?? previewMoves.get(node.fwId) ?? { x: node.x, y: node.y }
  const size = previewResize ?? { width: node.width, height: node.height }
  const absolute = { x: parentAbsolute.x + position.x, y: parentAbsolute.y + position.y }
  const visible = parentVisible && node.visible

  bounds.set(node.fwId, { x: absolute.x, y: absolute.y, width: size.width, height: size.height })
  if (visible) visibleNodeIds.push(node.fwId)
  if (isFrameNode(node)) {
    for (const child of node.children) {
      collectRenderMetrics(
        child,
        absolute,
        visible,
        previewMoves,
        previewResizes,
        bounds,
        visibleNodeIds,
      )
    }
  }
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
  let canvasCursor: CanvasCursor = 'default'
  let viewportCursor: 'grab' | 'grabbing' | null = null
  let activeVideoFwId: string | null = null
  let cursorContainer: HTMLElement | null = null

  const applyCursor = (): void => {
    if (cursorContainer !== null) cursorContainer.style.cursor = viewportCursor ?? canvasCursor
  }

  const draw = (ctx: RenderContext): void => {
    if (root === null) return
    bounds = new Map<string, Rect>()
    visibleNodeIds = []
    const { scale, offsetX, offsetY } = ctx.viewport
    const lod = getViewportLod(scale)
    const previewMoves = new Map(
      (interactionPreview.moves ?? []).map((move) => [move.fwId, { x: move.x, y: move.y }]),
    )
    const previewResizes = new Map(
      (interactionPreview.resizes ?? []).map((resize) => [resize.fwId, resize]),
    )
    collectRenderMetrics(
      ctx.root,
      { x: 0, y: 0 },
      true,
      previewMoves,
      previewResizes,
      bounds,
      visibleNodeIds,
    )
    const resolvedViewportSize = resolveViewportSize(ctx.viewportSize)
    const viewportSize =
      ctx.viewportSize === undefined
        ? {
            width: cursorContainer?.clientWidth || ctx.root.width * scale,
            height: cursorContainer?.clientHeight || ctx.root.height * scale,
          }
        : resolvedViewportSize
    const cullingOptions = {
      ...viewportSize,
      ...resolveViewportCullingLimits(ctx.cullingLimits),
    }
    const mountedNodeIds = getNodesInViewport(ctx.root, ctx.viewport, cullingOptions)
    const videoVisibleNodeIds =
      lod.detail === 'full'
        ? getNodesInViewport(ctx.root, ctx.viewport, {
            ...cullingOptions,
            overscan: 0,
          })
        : new Set<string>()
    const rootBounds: Rect = {
      x: ctx.root.x,
      y: ctx.root.y,
      width: ctx.root.width,
      height: ctx.root.height,
    }
    const connectionLayer =
      lod.connections === 'hidden' ? undefined : (
        <ConnectionLayer
          items={getConnectionsInViewport(ctx.root, ctx.viewport, cullingOptions)}
          selection={ctx.selection}
          scale={scale}
          rootBounds={rootBounds}
          detail={lod.connections}
        />
      )
    const canvasTree = renderNode(
      ctx.root,
      { x: 0, y: 0 },
      true,
      ctx.selection,
      previewMoves,
      previewResizes,
      mountedNodeIds,
      videoVisibleNodeIds,
      ctx.callbacks.onNodeAction,
      ctx.callbacks.onNodesDelete,
      activeVideoFwId,
      lod.detail,
      scale,
      0,
      connectionLayer,
    )
    const hoveredFwId = interactionPreview.hoveredFwId ?? null
    const hoveredNode = hoveredFwId === null ? null : findNodeById(ctx.root, hoveredFwId)
    const hoveredRect = hoveredFwId === null ? undefined : bounds.get(hoveredFwId)
    const generationToolbar =
      hoveredNode !== null &&
      hoveredRect !== undefined &&
      hoveredFwId !== null &&
      lod.detail === 'full' &&
      mountedNodeIds.has(hoveredFwId) &&
      (isAiImageNode(hoveredNode) || isAiVideoNode(hoveredNode))
        ? (
            <div
              data-fw-toolbar-anchor="true"
              style={{
                position: 'absolute',
                left: `${hoveredRect.x + hoveredRect.width}px`,
                top: `${hoveredRect.y}px`,
                width: 0,
                height: 0,
                pointerEvents: 'none',
              }}
            >
              <GenerationUnitToolbar
                node={hoveredNode}
                viewportScale={scale}
                onNodeAction={ctx.callbacks.onNodeAction}
                onNodesDelete={ctx.callbacks.onNodesDelete}
              />
            </div>
          )
        : null
    root.render(
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        <RendererStyles />
        <div
          data-fw-viewport="true"
          data-fw-lod={lod.detail}
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {canvasTree}
        </div>
        <InteractionOverlay
          preview={interactionPreview}
          viewport={ctx.viewport}
          selectionBounds={lod.detail === 'full' ? ctx.selection.flatMap((fwId) => {
            if (!mountedNodeIds.has(fwId)) return []
            const rect = bounds.get(fwId)
              return rect === undefined ? [] : [{ fwId, rect }]
          }) : []}
          hoverBounds={(() => {
            if (lod.detail !== 'full') return null
            const fwId = interactionPreview.hoveredFwId
            if (fwId === undefined || fwId === null) return null
            if (!mountedNodeIds.has(fwId)) return null
            const rect = bounds.get(fwId)
            return rect === undefined ? null : { fwId, rect }
          })()}
          toolbar={generationToolbar}
        />
      </div>,
    )
  }

  return {
    id: 'dom',
    displayName: 'HTML / DOM',

    mount(container, ctx) {
      root = createRoot(container)
      cursorContainer = container
      currentContext = ctx
      draw(ctx)
      interaction = createViewportInteraction(container, ctx.viewport, {
        onViewportChange: ctx.callbacks.onViewportChange,
        onPreview: (viewport) => {
          if (currentContext === null) return
          draw({ ...currentContext, viewport })
        },
        onCursorChange: (cursor) => {
          viewportCursor = cursor
          applyCursor()
        },
      })
      canvasInteraction = createCanvasInteraction(container, ctx, {
        onPreview: (preview) => {
          interactionPreview = preview
          if (currentContext !== null) draw(currentContext)
        },
        onCursorChange: (cursor) => {
          canvasCursor = cursor
          applyCursor()
        },
        onVideoActivationChange: (fwId) => {
          activeVideoFwId = fwId
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
      canvasCursor = 'default'
      viewportCursor = null
      activeVideoFwId = null
      if (cursorContainer !== null) cursorContainer.style.cursor = ''
      cursorContainer = null
    },

    getRenderedBounds() {
      return new Map(bounds)
    },

    getVisibleNodeIds() {
      return [...visibleNodeIds]
    },
  }
}
