import {
  assertShapeCoverage,
  isFrameNode,
  type CanvasNode,
  type Point,
  type Rect as CoreRect,
  type RenderContext,
  type RendererAdapter,
} from '@framewright/core'
import { Leafer, type IUI } from 'leafer-ui'
import { buildConnectionLayer, collectConnectionItems } from './connections'
import { LEAFER_SHAPES } from './shapes/registry'

export function createLeaferRenderer(): RendererAdapter {
  assertShapeCoverage('leafer', LEAFER_SHAPES)

  let leafer: Leafer | null = null
  let bounds = new Map<string, CoreRect>()
  let visibleNodeIds: string[] = []

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
    leafer.clear()
    bounds = new Map<string, CoreRect>()
    visibleNodeIds = []
    leafer.scale = ctx.viewport.scale
    leafer.x = ctx.viewport.offsetX
    leafer.y = ctx.viewport.offsetY
    // 连线不是 node：不进 node 树、不进 getRenderedBounds，只作为 root 的底层装饰注入
    const connectionLayer = buildConnectionLayer(
      collectConnectionItems(ctx.root),
      ctx.selection,
      ctx.viewport.scale,
    )
    buildNode(ctx.root, { x: 0, y: 0 }, true, ctx.selection, leafer, connectionLayer)
  }

  return {
    id: 'leafer',
    displayName: 'LeaferJS',

    mount(container, ctx) {
      leafer = new Leafer({ view: container })
      draw(ctx)
    },

    update(ctx) {
      draw(ctx)
    },

    destroy() {
      leafer?.destroy()
      leafer = null
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
