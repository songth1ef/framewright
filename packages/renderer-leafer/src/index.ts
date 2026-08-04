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
  type CanvasInteraction,
  type CanvasInteractionPreview,
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
    parent: IUI | Leafer,
    rootUnderlay?: IUI,
  ): void => {
    const absolute: Point = { x: parentAbsolute.x + node.x, y: parentAbsolute.y + node.y }
    const visible = parentVisible && node.visible
    bounds.set(node.fwId, {
      x: absolute.x,
      y: absolute.y,
      width: node.width,
      height: node.height,
    })

    const factory = LEAFER_SHAPES[node.fwType]
    const ui = factory({
      node,
      position: { x: node.x, y: node.y },
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
        buildNode(child, absolute, visible, selection, ui)
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
    // 连线不是 node：不进 node 树、不进 getRenderedBounds，只作为 root 的底层装饰注入
    const connectionLayer = buildConnectionLayer(
      collectConnectionItems(ctx.root),
      ctx.selection,
      ctx.viewport.scale,
    )
    buildNode(ctx.root, { x: 0, y: 0 }, true, ctx.selection, leafer, connectionLayer)
    // 交互 overlay（框选框/选中描边/控制点）加在所有节点之上——不是 node，不进 bounds
    leafer.add(
      buildInteractionOverlay({ preview: interactionPreview, viewportScale: ctx.viewport.scale }),
    )
  }

  return {
    id: 'leafer',
    displayName: 'LeaferJS',

    mount(container, ctx) {
      leafer = new Leafer({ view: container })
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
      })
      // 注册顺序是约定：viewport 的 pointerdown 先跑（中键/空格平移 preventDefault），
      // 画布手势检查 defaultPrevented 让位——与 DOM 侧同一互锁机制
      canvasInteraction = createCanvasInteraction(container, createLeaferHitProbe(leafer), ctx, {
        onPreview: (preview) => {
          interactionPreview = preview
          if (currentCtx !== null) draw(currentCtx)
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
    },

    getRenderedBounds() {
      return new Map(bounds)
    },

    getVisibleNodeIds() {
      return [...visibleNodeIds]
    },
  }
}
