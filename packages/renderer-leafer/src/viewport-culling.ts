import {
  canReuseViewportCulling,
  ConnectionBoundsCache,
  getConnectionsInViewport,
  getViewportLod,
  getViewportCullingResult,
  isFrameNode,
  type CanvasNode,
  type ConnectionItem,
  type Point,
  type Rect as CoreRect,
  type RenderContext,
  type ViewportCullingOptions,
  type ViewportCullingResult,
  type ViewportDetailLevel,
} from '@framewright/core'
import { Leafer, type IUI } from 'leafer-ui'
import type { CanvasInteractionPreview, NodeResize } from './canvas-interaction'
import { LeaferConnectionLayer } from './connections'
import { LEAFER_SHAPES, updateLeaferShape } from './shapes/registry'

interface SceneDescriptor {
  node: CanvasNode
  parentFwId: string | null
  depth: number
  position: Point
  size: { width: number; height: number }
  absolute: Point
  visible: boolean
  selected: boolean
}

interface MountedNode {
  descriptor: SceneDescriptor
  ui: IUI
  detail: ViewportDetailLevel
}

export interface LeaferSceneSnapshot {
  bounds: Map<string, CoreRect>
  visibleNodeIds: string[]
}

function collectDescriptors(
  ctx: RenderContext,
  preview: CanvasInteractionPreview,
): { descriptors: SceneDescriptor[]; snapshot: LeaferSceneSnapshot } {
  const previewMoves = new Map(
    (preview.moves ?? []).map((move) => [move.fwId, { x: move.x, y: move.y }]),
  )
  const previewResizes = new Map(
    (preview.resizes ?? []).map((resize) => [resize.fwId, resize] as const),
  )
  const descriptors: SceneDescriptor[] = []
  const bounds = new Map<string, CoreRect>()
  const visibleNodeIds: string[] = []

  const visit = (
    node: CanvasNode,
    parentFwId: string | null,
    parentAbsolute: Point,
    parentVisible: boolean,
    depth: number,
  ): void => {
    const previewResize: NodeResize | undefined = previewResizes.get(node.fwId)
    const position = previewResize ?? previewMoves.get(node.fwId) ?? { x: node.x, y: node.y }
    const size = previewResize ?? { width: node.width, height: node.height }
    const absolute = { x: parentAbsolute.x + position.x, y: parentAbsolute.y + position.y }
    const visible = parentVisible && node.visible
    const descriptor: SceneDescriptor = {
      node,
      parentFwId,
      depth,
      position,
      size,
      absolute,
      visible,
      selected: ctx.selection.includes(node.fwId),
    }
    descriptors.push(descriptor)
    bounds.set(node.fwId, { x: absolute.x, y: absolute.y, width: size.width, height: size.height })
    if (visible) visibleNodeIds.push(node.fwId)
    if (isFrameNode(node)) {
      for (const child of node.children) {
        visit(child, node.fwId, absolute, visible, depth + 1)
      }
    }
  }

  visit(ctx.root, null, { x: 0, y: 0 }, true, 0)
  return { descriptors, snapshot: { bounds, visibleNodeIds } }
}

/**
 * 用 fwId 协调 Leafer 场景图：视口变化只增删跨过裁剪边界的实例，留在集合内的实例复用。
 * 完整树的 bounds / visible 仍单独计算，裁剪不改变 RendererAdapter 的自报契约。
 */
export class LeaferViewportScene {
  private readonly mounted = new Map<string, MountedNode>()
  private readonly connectionBoundsCache = new ConnectionBoundsCache()
  private mountedOrder: string[] = []
  private connectionLayer: LeaferConnectionLayer | null = null
  private cullingCache: {
    root: RenderContext['root']
    result: ViewportCullingResult
    connections: ConnectionItem[]
    connectionDetail: ReturnType<typeof getViewportLod>['connections']
  } | null = null

  constructor(private readonly leafer: Leafer) {}

  reconcile(
    ctx: RenderContext,
    cullingOptions: ViewportCullingOptions,
    preview: CanvasInteractionPreview = {},
  ): LeaferSceneSnapshot {
    const { descriptors, snapshot } = collectDescriptors(ctx, preview)
    const lod = getViewportLod(ctx.viewport.scale)
    const descriptorById = new Map(descriptors.map((descriptor) => [descriptor.node.fwId, descriptor]))
    const canReuse =
      this.cullingCache !== null &&
      this.cullingCache.root === ctx.root &&
      this.cullingCache.connectionDetail === lod.connections &&
      canReuseViewportCulling(this.cullingCache.result, ctx.viewport, cullingOptions)
    if (!canReuse) {
      this.cullingCache = {
        root: ctx.root,
        result: getViewportCullingResult(ctx.root, ctx.viewport, cullingOptions),
        connections: lod.connections === 'hidden'
          ? []
          : getConnectionsInViewport(
            ctx.root,
            ctx.viewport,
            cullingOptions,
            this.connectionBoundsCache,
          ),
        connectionDetail: lod.connections,
      }
    }
    const cullingCache = this.cullingCache
    if (cullingCache === null) throw new Error('裁剪缓存初始化失败')
    const desiredIds = cullingCache.result.nodeIds

    const removals = [...this.mounted.entries()]
      .filter(([fwId]) => !desiredIds.has(fwId) || !descriptorById.has(fwId))
      .sort((a, b) => b[1].descriptor.depth - a[1].descriptor.depth)
    for (const [fwId] of removals) this.destroyMountedNode(fwId)

    for (const descriptor of descriptors) {
      const fwId = descriptor.node.fwId
      if (!desiredIds.has(fwId)) continue
      const previous = this.mounted.get(fwId)
      if (previous === undefined) {
        this.createMountedNode(descriptor, lod.detail)
        continue
      }

      const typeChanged = previous.descriptor.node.fwType !== descriptor.node.fwType
      const parentChanged = previous.descriptor.parentFwId !== descriptor.parentFwId
      if (typeChanged || parentChanged) {
        if ((typeChanged || parentChanged) && isFrameNode(previous.descriptor.node)) {
          this.destroyMountedSubtree(fwId)
        } else {
          this.destroyMountedNode(fwId)
        }
        this.createMountedNode(descriptor, lod.detail)
      } else {
        const previousNode = previous.descriptor.node
        previous.descriptor = descriptor
        updateLeaferShape(previous.ui, previousNode, previous.detail, {
          node: descriptor.node,
          position: descriptor.position,
          size: descriptor.size,
          selected: descriptor.selected,
          detail: lod.detail,
        })
        previous.detail = lod.detail
        previous.ui.data = {
          ...(previous.ui.data as Record<string, unknown> | undefined),
          fwId,
        }
      }
    }

    const rootUi = this.mounted.get(ctx.root.fwId)?.ui
    if (rootUi !== undefined) {
      if (this.connectionLayer === null) {
        this.connectionLayer = new LeaferConnectionLayer()
        rootUi.add(this.connectionLayer.ui, 0)
      }
      this.connectionLayer.reconcile(
        cullingCache.connections,
        ctx.selection,
        ctx.viewport.scale,
        lod.connections,
      )
    }
    this.syncChildOrder(descriptors, desiredIds, ctx.root.fwId)
    this.mountedOrder = descriptors
      .map((descriptor) => descriptor.node.fwId)
      .filter((fwId) => this.mounted.has(fwId))
    return snapshot
  }

  getMountedNodeIds(): string[] {
    return [...this.mountedOrder]
  }

  getMountedUi(fwId: string): IUI | undefined {
    return this.mounted.get(fwId)?.ui
  }

  getConnectionLayer(): IUI | null {
    return this.connectionLayer?.ui ?? null
  }

  destroy(): void {
    this.destroyConnectionLayer()
    const entries = [...this.mounted.entries()].sort(
      (a, b) => b[1].descriptor.depth - a[1].descriptor.depth,
    )
    for (const [fwId] of entries) this.destroyMountedNode(fwId)
    this.mountedOrder = []
    this.cullingCache = null
  }

  private createMountedNode(descriptor: SceneDescriptor, detail: ViewportDetailLevel): void {
    const parent =
      descriptor.parentFwId === null
        ? this.leafer
        : this.mounted.get(descriptor.parentFwId)?.ui
    if (parent === undefined) return
    const ui = LEAFER_SHAPES[descriptor.node.fwType]({
      node: descriptor.node,
      position: descriptor.position,
      size: descriptor.size,
      selected: descriptor.selected,
      detail,
    })
    ui.data = { ...(ui.data as Record<string, unknown> | undefined), fwId: descriptor.node.fwId }
    parent.add(ui)
    this.mounted.set(descriptor.node.fwId, { descriptor, ui, detail })
  }

  private destroyMountedNode(fwId: string): void {
    const mounted = this.mounted.get(fwId)
    if (mounted === undefined) return
    mounted.ui.remove()
    mounted.ui.destroy()
    this.mounted.delete(fwId)
  }

  private destroyMountedSubtree(rootFwId: string): void {
    const isInSubtree = (mounted: MountedNode): boolean => {
      let fwId: string | null = mounted.descriptor.node.fwId
      while (fwId !== null) {
        if (fwId === rootFwId) return true
        fwId = this.mounted.get(fwId)?.descriptor.parentFwId ?? null
      }
      return false
    }
    const subtree = [...this.mounted.entries()]
      .filter(([, mounted]) => isInSubtree(mounted))
      .sort((a, b) => b[1].descriptor.depth - a[1].descriptor.depth)
    for (const [fwId] of subtree) this.destroyMountedNode(fwId)
  }

  private destroyConnectionLayer(): void {
    if (this.connectionLayer === null) return
    this.connectionLayer.destroy()
    this.connectionLayer = null
  }

  private syncChildOrder(
    descriptors: readonly SceneDescriptor[],
    desiredIds: ReadonlySet<string>,
    rootFwId: string,
  ): void {
    const childrenByParent = new Map<string | null, IUI[]>()
    for (const descriptor of descriptors) {
      if (!desiredIds.has(descriptor.node.fwId)) continue
      const ui = this.mounted.get(descriptor.node.fwId)?.ui
      if (ui === undefined) continue
      const siblings = childrenByParent.get(descriptor.parentFwId) ?? []
      siblings.push(ui)
      childrenByParent.set(descriptor.parentFwId, siblings)
    }
    for (const [parentFwId, children] of childrenByParent) {
      const parent = parentFwId === null ? this.leafer : this.mounted.get(parentFwId)?.ui
      if (parent === undefined) continue
      const offset = parentFwId === rootFwId && this.connectionLayer !== null ? 1 : 0
      children.forEach((child, index) => parent.add(child, index + offset))
    }
  }
}
