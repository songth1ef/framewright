import {
  CONNECTION_CURVE_MAX_HORIZONTAL_OFFSET,
  computeConnectionCurve,
  type ConnectionCurve,
} from './connection-style'
import type { ConnectionItem } from './connections'
import {
  isAiImageNode,
  isAiVideoNode,
  isFrameNode,
  type CanvasNode,
  type FrameNode,
} from './node-schema'
import { walkTreePruned, type Point } from './node-tree'
import {
  resolveConnectionVisibility,
  type ConnectionVisibility,
  type Rect,
  type Viewport,
} from './renderer-adapter'
import { screenToCanvas } from './viewport'

export interface ViewportCullingOptions {
  /** 视口在屏幕坐标中的宽度（像素）。 */
  width: number
  /** 视口在屏幕坐标中的高度（像素）。 */
  height: number
  /**
   * 向四周预挂载多少个视口尺寸。默认 1，即 3x3、共 9 个视口面积。
   * 设为 0 时只保留当前视口相交项。
   */
  overscan?: number
  /** 最多挂载多少个节点（包含 root 容器）。默认 1500。 */
  maxNodes?: number
  /** 最多返回多少条连线。默认 1000。 */
  maxConnections?: number
  /**
   * 连线是否参与当前视图。隐藏是用户观看状态，不改变 node 树或溯源数据。
   * getConnectionsInViewport 会在任何树遍历与曲线求解前短路。
   */
  connectionVisibility?: ConnectionVisibility
}

export interface ViewportCullingLimits {
  maxNodes: number
  maxConnections: number
}

/** 2535 个节点时 DOM 已降至 24fps；1500 为该实测拐点留出约 40% 余量。 */
export const DEFAULT_MAX_NODES = 1_500
/** 100% 缩放实测 367 条连线可流畅运行；1000 保留约 2.7 倍余量并阻断万级爆炸。 */
export const DEFAULT_MAX_CONNECTIONS = 1_000

export const DEFAULT_VIEWPORT_CULLING_LIMITS: ViewportCullingLimits = {
  maxNodes: DEFAULT_MAX_NODES,
  maxConnections: DEFAULT_MAX_CONNECTIONS,
}

/** 未提供用户预算时，显式落到经过性能实测确定的契约默认值。 */
export function resolveViewportCullingLimits(
  limits: ViewportCullingLimits | undefined,
): ViewportCullingLimits {
  return limits ?? DEFAULT_VIEWPORT_CULLING_LIMITS
}

function getViewportBounds(
  viewport: Viewport,
  options: ViewportCullingOptions,
  overscan: number,
): Rect {
  const topLeft = screenToCanvas(viewport, {
    x: -options.width * overscan,
    y: -options.height * overscan,
  })
  const bottomRight = screenToCanvas(viewport, {
    x: options.width * (1 + overscan),
    y: options.height * (1 + overscan),
  })
  return {
    x: Math.min(topLeft.x, bottomRight.x),
    y: Math.min(topLeft.y, bottomRight.y),
    width: Math.abs(bottomRight.x - topLeft.x),
    height: Math.abs(bottomRight.y - topLeft.y),
  }
}

function getCullingBounds(viewport: Viewport, options: ViewportCullingOptions): Rect {
  return getViewportBounds(viewport, options, Math.max(0, options.overscan ?? 1))
}

function getLimit(value: number | undefined, fallback: number, name: string, allowZero: boolean) {
  const limit = value ?? fallback
  const minimum = allowZero ? 0 : 1
  if (!Number.isSafeInteger(limit) || limit < minimum) {
    throw new RangeError(`${name} 必须是${allowZero ? '非负' : '正'}安全整数`)
  }
  return limit
}

function normalizedRectDistanceToViewportCenter(
  rect: Rect,
  center: Point,
  halfWidth: number,
  halfHeight: number,
): number {
  const deltaX = rect.x + rect.width / 2 - center.x
  const deltaY = rect.y + rect.height / 2 - center.y
  return Math.max(Math.abs(deltaX) / halfWidth, Math.abs(deltaY) / halfHeight)
}

function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  )
}

/**
 * 只用端点判断连线是否可能与视口相交。
 * y 区间是曲线精确范围；x 区间按控制点最大水平外推量保守扩张，false 一定不可见。
 */
export function connectionMayIntersectBounds(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  bounds: Rect,
): boolean {
  const minX = Math.min(fromX, toX) - CONNECTION_CURVE_MAX_HORIZONTAL_OFFSET
  const maxX = Math.max(fromX, toX) + CONNECTION_CURVE_MAX_HORIZONTAL_OFFSET
  const minY = Math.min(fromY, toY)
  const maxY = Math.max(fromY, toY)
  return (
    minX <= bounds.x + bounds.width &&
    maxX >= bounds.x &&
    minY <= bounds.y + bounds.height &&
    maxY >= bounds.y
  )
}

/**
 * 返回当前扩展视口内应挂载的节点 fwId。
 * 这是渲染优化；node.visible 的业务级联语义会先应用，二者互不替代。
 */
export function getNodesInViewport(
  root: FrameNode,
  viewport: Viewport,
  options: ViewportCullingOptions,
): ReadonlySet<string> {
  return getViewportCullingResult(root, viewport, options).nodeIds
}

export interface ViewportCullingResult {
  /** 上次扩展挂载区内的节点集合。 */
  nodeIds: ReadonlySet<string>
  /** 只要当前真实视口仍完整落在这里，上述集合就不会漏掉当前应显示的节点。 */
  validViewportBounds: Rect
  /** 生成这份派生结果时使用的预算，仅用于判断缓存是否仍有效。 */
  cullingLimits: ViewportCullingLimits
}

interface NodeCandidate {
  fwId: string
  parentFwId: string | null
  distance: number
  order: number
  isRoot: boolean
}

/** 返回节点裁剪集合及其可安全复用的画布区域。 */
export function getViewportCullingResult(
  root: FrameNode,
  viewport: Viewport,
  options: ViewportCullingOptions,
): ViewportCullingResult {
  const bounds = getCullingBounds(viewport, options)
  const currentBounds = getViewportBounds(viewport, options, 0)
  const viewportCenter = {
    x: currentBounds.x + currentBounds.width / 2,
    y: currentBounds.y + currentBounds.height / 2,
  }
  // 按真实视口的半宽/半高归一化，使等值面与视口同宽高比。
  //
  // 🔴 两个维度必须一起兜底，不能各兜各的。
  // 非正尺寸发生在 host 尚未完成测量、或容器某一维被布局压塌时。
  // 若各自独立兜成 1，遇到 0×800 这类**半退化**视口就会得到 halfW=1、halfH=400 ——
  // 400 倍的各向异性，等值面退化成一条竖条，几乎只按 x 排序。
  // 那比退回圆形还糟：圆形至少是各向同性的中性行为。
  // 所以任一维不可用时，两维取同一个值，退化为中性的正方形保留区。
  const halfWidth = currentBounds.width / 2
  const halfHeight = currentBounds.height / 2
  const bothUsable = halfWidth > 0 && halfHeight > 0
  const neutralHalfExtent = Math.max(halfWidth, halfHeight, 1)
  const viewportHalfWidth = bothUsable ? halfWidth : neutralHalfExtent
  const viewportHalfHeight = bothUsable ? halfHeight : neutralHalfExtent
  const maxNodes = getLimit(options.maxNodes, DEFAULT_MAX_NODES, 'maxNodes', false)
  const connectionsVisible = resolveConnectionVisibility(options.connectionVisibility) === 'visible'
  const maxConnections = connectionsVisible
    ? getLimit(options.maxConnections, DEFAULT_MAX_CONNECTIONS, 'maxConnections', true)
    : 0
  const candidates: NodeCandidate[] = []
  const visibleNodeIds = new Set<string>()
  const connectionSources: Array<readonly string[]> = []

  const collect = (
    node: CanvasNode,
    parentX: number,
    parentY: number,
    parentFwId: string | null,
  ): void => {
    if (!node.visible) return
    const absolute = { x: parentX + node.x, y: parentY + node.y }
    visibleNodeIds.add(node.fwId)
    if (connectionsVisible && (isAiImageNode(node) || isAiVideoNode(node))) {
      connectionSources.push(node.sourceFwIds)
    }
    const nodeBounds = {
      x: absolute.x,
      y: absolute.y,
      width: node.width,
      height: node.height,
    }
    if (intersects(bounds, nodeBounds)) {
      candidates.push({
        fwId: node.fwId,
        parentFwId,
        distance: normalizedRectDistanceToViewportCenter(
          nodeBounds,
          viewportCenter,
          viewportHalfWidth,
          viewportHalfHeight,
        ),
        order: candidates.length,
        isRoot: node === root,
      })
    }
    if (isFrameNode(node)) {
      for (const child of node.children) collect(child, absolute.x, absolute.y, node.fwId)
    }
  }
  collect(root, 0, 0, null)

  let validConnectionCount = 0
  for (const sourceFwIds of connectionSources) {
    for (const sourceFwId of sourceFwIds) {
      if (visibleNodeIds.has(sourceFwId)) validConnectionCount += 1
      if (validConnectionCount > maxConnections) break
    }
    if (validConnectionCount > maxConnections) break
  }
  const connectionsMayBeLimited = validConnectionCount > maxConnections
  if (candidates.length <= maxNodes) {
    return {
      nodeIds: new Set(candidates.map(({ fwId }) => fwId)),
      validViewportBounds: connectionsMayBeLimited ? currentBounds : bounds,
      cullingLimits: { maxNodes, maxConnections },
    }
  }

  candidates.sort(
    (left, right) =>
      Number(right.isRoot) - Number(left.isRoot) ||
      left.distance - right.distance ||
      left.order - right.order,
  )
  const candidateById = new Map(candidates.map((candidate) => [candidate.fwId, candidate]))
  const selected = new Set<string>()
  for (const candidate of candidates) {
    if (selected.has(candidate.fwId)) continue
    const missingChain: NodeCandidate[] = []
    let current: NodeCandidate | undefined = candidate
    while (current !== undefined && !selected.has(current.fwId)) {
      missingChain.push(current)
      current =
        current.parentFwId === null ? undefined : candidateById.get(current.parentFwId)
    }
    if (current === undefined && missingChain.at(-1)?.parentFwId !== null) continue
    if (selected.size + missingChain.length > maxNodes) continue
    for (let index = missingChain.length - 1; index >= 0; index -= 1) {
      selected.add(missingChain[index]!.fwId)
    }
    if (selected.size === maxNodes) break
  }
  return {
    nodeIds: selected,
    // 排名依赖真实视口中心；截断后只允许相同视口复用，平移必须重新排名。
    validViewportBounds: currentBounds,
    cullingLimits: { maxNodes, maxConnections },
  }
}

/**
 * 判断当前真实视口是否仍被上次扩展挂载区完整覆盖。
 * 调用方还必须自行确认 node 树没有变化；本函数只处理视口几何。
 */
export function canReuseViewportCulling(
  previous: ViewportCullingResult,
  viewport: Viewport,
  options: ViewportCullingOptions,
): boolean {
  const maxNodes = getLimit(options.maxNodes, DEFAULT_MAX_NODES, 'maxNodes', false)
  const maxConnections =
    resolveConnectionVisibility(options.connectionVisibility) === 'visible'
      ? getLimit(options.maxConnections, DEFAULT_MAX_CONNECTIONS, 'maxConnections', true)
      : 0
  if (
    previous.cullingLimits.maxNodes !== maxNodes ||
    previous.cullingLimits.maxConnections !== maxConnections
  ) {
    return false
  }
  const current = getViewportBounds(viewport, options, 0)
  const valid = previous.validViewportBounds
  return (
    current.x >= valid.x &&
    current.y >= valid.y &&
    current.x + current.width <= valid.x + valid.width &&
    current.y + current.height <= valid.y + valid.height
  )
}

function cubicAt(p0: number, c1: number, c2: number, p3: number, t: number): number {
  const inverse = 1 - t
  return (
    inverse * inverse * inverse * p0 +
    3 * inverse * inverse * t * c1 +
    3 * inverse * t * t * c2 +
    t * t * t * p3
  )
}

function cubicAxisBounds(p0: number, c1: number, c2: number, p3: number): [number, number] {
  let min = Math.min(p0, p3)
  let max = Math.max(p0, p3)
  const a = -p0 + 3 * c1 - 3 * c2 + p3
  const b = 3 * p0 - 6 * c1 + 3 * c2
  const c = -3 * p0 + 3 * c1
  const qa = 3 * a
  const qb = 2 * b
  const discriminant = qb * qb - 4 * qa * c
  const roots: number[] = []

  if (Math.abs(qa) < Number.EPSILON) {
    if (Math.abs(qb) >= Number.EPSILON) roots.push(-c / qb)
  } else if (discriminant >= 0) {
    const squareRoot = Math.sqrt(discriminant)
    roots.push((-qb + squareRoot) / (2 * qa), (-qb - squareRoot) / (2 * qa))
  }

  for (const t of roots) {
    if (t <= 0 || t >= 1) continue
    const value = cubicAt(p0, c1, c2, p3, t)
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  return [min, max]
}

/** 三次贝塞尔曲线自身的紧致轴对齐包围盒，而不是只看两个端点。 */
export function getConnectionBounds(curve: ConnectionCurve): Rect {
  const [minX, maxX] = cubicAxisBounds(curve.p0.x, curve.c1.x, curve.c2.x, curve.p3.x)
  const [minY, maxY] = cubicAxisBounds(curve.p0.y, curve.c1.y, curve.c2.y, curve.p3.y)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

interface CachedConnectionBounds {
  fromX: number
  fromY: number
  toX: number
  toY: number
  bounds: Rect
}

/** 按端点节点对缓存贝塞尔包围盒；任一端点几何改变时自动重算。 */
export class ConnectionBoundsCache {
  private readonly entries = new Map<string, CachedConnectionBounds>()

  get size(): number {
    return this.entries.size
  }

  get(fromFwId: string, toFwId: string, curve: ConnectionCurve): Rect {
    const key = `${fromFwId}\u0000${toFwId}`
    const cached = this.entries.get(key)
    if (
      cached !== undefined &&
      cached.fromX === curve.p0.x &&
      cached.fromY === curve.p0.y &&
      cached.toX === curve.p3.x &&
      cached.toY === curve.p3.y
    ) {
      return cached.bounds
    }
    const bounds = getConnectionBounds(curve)
    this.entries.set(key, {
      fromX: curve.p0.x,
      fromY: curve.p0.y,
      toX: curve.p3.x,
      toY: curve.p3.y,
      bounds,
    })
    return bounds
  }

  retain(keys: ReadonlySet<string>): void {
    for (const key of this.entries.keys()) {
      if (!keys.has(key)) this.entries.delete(key)
    }
  }
}

/**
 * 连线独立按曲线包围盒裁剪。端点是否落在视口内不参与判断，避免漏掉横穿视口的线。
 */
export function getConnectionsInViewport(
  root: FrameNode,
  viewport: Viewport,
  options: ViewportCullingOptions,
  boundsCache?: ConnectionBoundsCache,
): ConnectionItem[] {
  if (resolveConnectionVisibility(options.connectionVisibility) === 'hidden') return []

  const bounds = getCullingBounds(viewport, options)
  const currentBounds = getViewportBounds(viewport, options, 0)
  const viewportCenter = {
    x: currentBounds.x + currentBounds.width / 2,
    y: currentBounds.y + currentBounds.height / 2,
  }
  const geometry = new Map<string, { node: CanvasNode; absolute: Point }>()

  walkTreePruned(root, (node, absolute) => {
    if (!node.visible) return false
    geometry.set(node.fwId, { node, absolute })
  })

  const maxConnections = getLimit(
    options.maxConnections,
    DEFAULT_MAX_CONNECTIONS,
    'maxConnections',
    true,
  )
  const candidates: Array<{
    fromFwId: string
    toFwId: string
    from: Point
    to: Point
    distance: number
    order: number
  }> = []
  const connectionKeys = new Set<string>()
  for (const { node, absolute } of geometry.values()) {
    if (!isAiImageNode(node) && !isAiVideoNode(node)) continue
    for (const sourceFwId of node.sourceFwIds) {
      const source = geometry.get(sourceFwId)
      if (source === undefined) continue
      const fromX = source.absolute.x + source.node.width
      const fromY = source.absolute.y + source.node.height / 2
      const toX = absolute.x
      const toY = absolute.y + node.height / 2
      if (!connectionMayIntersectBounds(fromX, fromY, toX, toY, bounds)) continue

      const connectionKey = `${sourceFwId}\u0000${node.fwId}`
      connectionKeys.add(connectionKey)
      const deltaX = (fromX + toX) / 2 - viewportCenter.x
      const deltaY = (fromY + toY) / 2 - viewportCenter.y
      candidates.push({
        fromFwId: sourceFwId,
        toFwId: node.fwId,
        from: { x: fromX, y: fromY },
        to: { x: toX, y: toY },
        distance: deltaX * deltaX + deltaY * deltaY,
        order: candidates.length,
      })
    }
  }
  boundsCache?.retain(connectionKeys)
  if (maxConnections === 0) return []
  if (candidates.length > maxConnections) {
    candidates.sort(
      (left, right) => left.distance - right.distance || left.order - right.order,
    )
  }

  const connections: ConnectionItem[] = []
  for (const candidate of candidates) {
    const curve = computeConnectionCurve(candidate.from, candidate.to)
    const connectionBounds =
      boundsCache?.get(candidate.fromFwId, candidate.toFwId, curve) ?? getConnectionBounds(curve)
    if (!intersects(bounds, connectionBounds)) continue
    connections.push({
      fromFwId: candidate.fromFwId,
      toFwId: candidate.toFwId,
      curve,
    })
    if (connections.length === maxConnections) break
  }
  return connections
}
