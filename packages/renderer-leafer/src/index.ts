import {
  assertShapeCoverage,
  collectConnectionItems,
  isFrameNode,
  type CanvasNode,
  type Point,
  type Rect as CoreRect,
  type RenderContext,
  type RendererAdapter,
} from '@framewright/core'
import { Leafer, PointerEvent, type IUI } from 'leafer-ui'
import { assertBuiltinGesturesInert } from './builtin-gesture-guard'
import {
  createCanvasInteraction,
  EMPTY_INTERACTION_PREVIEW,
  type CanvasCursor,
  type CanvasInteraction,
  type CanvasInteractionPreview,
  type NodeResize,
} from './canvas-interaction'
import { buildConnectionLayer } from './connections'
import { createLeaferHitProbe } from './hit-probe'
import { buildInteractionOverlay } from './interaction-overlay'
import { dispatchNodeActionTap } from './node-action'
import { LEAFER_SHAPES } from './shapes/registry'
import { createViewportInteraction, type ViewportInteraction } from './viewport-interaction'

export function createLeaferRenderer(): RendererAdapter {
  assertShapeCoverage('leafer', LEAFER_SHAPES)

  let leafer: Leafer | null = null
  let interaction: ViewportInteraction | null = null
  let canvasInteraction: CanvasInteraction | null = null
  let interactionPreview: CanvasInteractionPreview = EMPTY_INTERACTION_PREVIEW
  let bounds = new Map<string, CoreRect>()
  let visibleNodeIds: string[] = []
  /** 最近一次 draw 的 ctx：tap 分派只读 callbacks，用它避免闭包抓住过期 ctx */
  let currentCtx: RenderContext | null = null
  // 两个手势模块都会驱动光标，本地统一仲裁：平移手势（grab/grabbing）优先于画布手势
  let canvasCursor: CanvasCursor = 'default'
  let viewportCursor: 'grab' | 'grabbing' | null = null
  let cursorContainer: HTMLElement | null = null

  const applyCursor = (): void => {
    if (cursorContainer !== null) cursorContainer.style.cursor = viewportCursor ?? canvasCursor
  }

  /**
   * 只改 transform 的轻量预览：手势进行中逐帧调用，不重建场景图。
   * 连线描边等的缩放补偿由紧随其后的 host 回流 draw 补齐（最多差一帧）。
   */
  const applyViewport = (viewport: RenderContext['viewport']): void => {
    if (leafer === null) return
    leafer.scale = viewport.scale
    leafer.x = viewport.offsetX
    leafer.y = viewport.offsetY
  }

  const buildNode = (
    node: CanvasNode,
    parentAbsolute: Point,
    parentVisible: boolean,
    selection: readonly string[],
    previewMoves: ReadonlyMap<string, Point>,
    previewResizes: ReadonlyMap<string, NodeResize>,
    parent: IUI | Leafer,
    rootUnderlay?: IUI,
  ): void => {
    // 拖拽/缩放预览是纯呈现：只改画出来的位置与尺寸，不碰 node 树（契约 §1）
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

    const factory = LEAFER_SHAPES[node.fwType]
    const ui = factory({
      node,
      position,
      size,
      selected: selection.includes(node.fwId),
    })
    // node 容器打 fwId 标记：内部按钮的 tap 分派沿父链找它（见 node-action.ts）
    ui.data = { ...(ui.data as Record<string, unknown> | undefined), fwId: node.fwId }
    parent.add(ui)
    if (visible) visibleNodeIds.push(node.fwId)

    if (isFrameNode(node)) {
      // 溯源连线层只挂在 root frame 里、作为第一个孩子（connection-spec §2）：
      // 在 root 自己的 background（画布底色）之上、一切业务节点之下。
      // 若加在 root 之外，会被 root 的白色背景整个盖住。
      if (rootUnderlay !== undefined) ui.add(rootUnderlay)
      for (const child of node.children) {
        buildNode(child, absolute, visible, selection, previewMoves, previewResizes, ui)
      }
    }
  }

  const draw = (ctx: RenderContext): void => {
    if (leafer === null) return
    currentCtx = ctx
    leafer.clear()
    bounds = new Map<string, CoreRect>()
    visibleNodeIds = []
    applyViewport(ctx.viewport)
    const previewMoves = new Map(
      (interactionPreview.moves ?? []).map((move) => [move.fwId, { x: move.x, y: move.y }]),
    )
    const previewResizes = new Map(
      (interactionPreview.resizes ?? []).map((resize) => [resize.fwId, resize]),
    )
    // 连线不是 node：不进 node 树、不进 getRenderedBounds，只作为 root 的底层装饰注入
    const connectionLayer = buildConnectionLayer(
      collectConnectionItems(ctx.root),
      ctx.selection,
      ctx.viewport.scale,
    )
    buildNode(
      ctx.root,
      { x: 0, y: 0 },
      true,
      ctx.selection,
      previewMoves,
      previewResizes,
      leafer,
      connectionLayer,
    )
    // 交互 overlay（框选框/选中描边/控制点）加在所有节点之上——不是 node，不进 bounds。
    // 包围盒取预览后的 bounds，跟随拖拽/缩放预览（与 DOM 侧同口径）
    leafer.add(
      buildInteractionOverlay({
        preview: interactionPreview,
        selectionBounds: ctx.selection.flatMap((fwId) => {
          const rect = bounds.get(fwId)
          return rect === undefined ? [] : [{ fwId, rect }]
        }),
        hoverBounds: (() => {
          const fwId = interactionPreview.hoveredFwId
          if (fwId === undefined || fwId === null) return null
          const rect = bounds.get(fwId)
          return rect === undefined ? null : { fwId, rect }
        })(),
        viewportScale: ctx.viewport.scale,
      }),
    )
  }

  return {
    id: 'leafer',
    displayName: 'LeaferJS',

    mount(container, ctx) {
      leafer = new Leafer({ view: container })
      cursorContainer = container
      // 建实例时显式确认内建手势为关（renderer-contract §3.1）：
      // 我们只把 Leafer 当感知器，视口手势由下面的原生事件状态机实现
      assertBuiltinGesturesInert(leafer)
      // 内部按钮（点击生成 / 重试）：只上报 onNodeAction，不参与选中/拖拽/双击（M1 §5）
      leafer.on(PointerEvent.TAP, (e) => {
        if (currentCtx !== null) dispatchNodeActionTap(e.target as IUI, currentCtx.callbacks)
      })
      // Leafer 不上抛 wheel，且内建 wheel handler 对 transform 是 no-op——
      // 手势监听走 container 原生事件（wheel 必须 passive:false + preventDefault）
      interaction = createViewportInteraction(container, ctx.viewport, {
        onViewportChange: ctx.callbacks.onViewportChange,
        onPreview: applyViewport,
        onCursorChange: (cursor) => {
          viewportCursor = cursor
          applyCursor()
        },
      })
      // 注册顺序是约定：viewport 的 pointerdown 先跑（中键/空格平移 preventDefault），
      // 画布手势检查 defaultPrevented 让位——与 DOM 侧同一互锁机制
      canvasInteraction = createCanvasInteraction(container, createLeaferHitProbe(leafer), ctx, {
        onPreview: (preview) => {
          interactionPreview = preview
          if (currentCtx !== null) draw(currentCtx)
        },
        onCursorChange: (cursor) => {
          canvasCursor = cursor
          applyCursor()
        },
      })
      draw(ctx)
    },

    update(ctx) {
      interaction?.update(ctx.viewport, ctx.callbacks.onViewportChange)
      canvasInteraction?.update(ctx)
      draw(ctx)
    },

    destroy() {
      interaction?.destroy()
      interaction = null
      canvasInteraction?.destroy()
      canvasInteraction = null
      interactionPreview = EMPTY_INTERACTION_PREVIEW
      leafer?.destroy()
      leafer = null
      currentCtx = null
      bounds = new Map<string, CoreRect>()
      visibleNodeIds = []
      canvasCursor = 'default'
      viewportCursor = null
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
