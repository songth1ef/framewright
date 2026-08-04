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
    // 溯源连线层：视口 transform 之内、所有节点之下（connection-spec §2），不是 node
    leafer.add(
      buildConnectionLayer(collectConnectionItems(ctx.root), ctx.selection, ctx.viewport.scale),
    )
    buildNode(ctx.root, { x: 0, y: 0 }, true, ctx.selection, leafer)
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
