import {
  assertShapeCoverage,
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
} from './canvas-interaction'
import { createLeaferHitProbe } from './hit-probe'
import { buildInteractionOverlay } from './interaction-overlay'
import { dispatchNodeActionTap } from './node-action'
import { LEAFER_SHAPES } from './shapes/registry'
import { LeaferViewportScene } from './viewport-culling'
import { createViewportInteraction, type ViewportInteraction } from './viewport-interaction'

export function createLeaferRenderer(): RendererAdapter {
  assertShapeCoverage('leafer', LEAFER_SHAPES)

  let leafer: Leafer | null = null
  let scene: LeaferViewportScene | null = null
  let interactionOverlay: IUI | null = null
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

  const draw = (ctx: RenderContext): void => {
    if (leafer === null || scene === null || cursorContainer === null) return
    currentCtx = ctx
    applyViewport(ctx.viewport)
    interactionOverlay?.remove()
    interactionOverlay?.destroy()
    interactionOverlay = null
    const snapshot = scene.reconcile(
      ctx,
      {
        width: cursorContainer.clientWidth || ctx.root.width * ctx.viewport.scale,
        height: cursorContainer.clientHeight || ctx.root.height * ctx.viewport.scale,
      },
      interactionPreview,
    )
    bounds = snapshot.bounds
    visibleNodeIds = snapshot.visibleNodeIds
    // 交互 overlay（框选框/选中描边/控制点）加在所有节点之上——不是 node，不进 bounds。
    // 包围盒取预览后的 bounds，跟随拖拽/缩放预览（与 DOM 侧同口径）
    interactionOverlay = buildInteractionOverlay({
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
    })
    leafer.add(interactionOverlay)
  }

  return {
    id: 'leafer',
    displayName: 'LeaferJS',

    mount(container, ctx) {
      leafer = new Leafer({ view: container })
      scene = new LeaferViewportScene(leafer)
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
      interactionOverlay?.remove()
      interactionOverlay?.destroy()
      interactionOverlay = null
      scene?.destroy()
      scene = null
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
