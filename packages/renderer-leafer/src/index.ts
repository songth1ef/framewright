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
import { LEAFER_SHAPES } from './shapes/registry'

export function createLeaferRenderer(): RendererAdapter {
  assertShapeCoverage('leafer', LEAFER_SHAPES)

  let leafer: Leafer | null = null
  let bounds = new Map<string, CoreRect>()
  let visibleNodeIds: string[] = []

  const buildNode = (
    node: CanvasNode,
    parentAbsolute: Point,
    selection: readonly string[],
    parent: IUI | Leafer,
  ): void => {
    const absolute: Point = { x: parentAbsolute.x + node.x, y: parentAbsolute.y + node.y }
    bounds.set(node.fwId, {
      x: absolute.x,
      y: absolute.y,
      width: node.width,
      height: node.height,
    })

    const factory = LEAFER_SHAPES[node.fwType]
    const ui = factory({ node, absolute, selected: selection.includes(node.fwId) })
    parent.add(ui)
    if (node.visible) visibleNodeIds.push(node.fwId)

    if (isFrameNode(node)) {
      // 子节点同样使用画布绝对坐标，故父级传 leafer 根而非 ui，避免双重偏移
      for (const child of node.children) {
        buildNode(child, absolute, selection, leafer as Leafer)
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
    buildNode(ctx.root, { x: 0, y: 0 }, ctx.selection, leafer)
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
