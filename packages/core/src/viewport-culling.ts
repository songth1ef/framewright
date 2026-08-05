import { computeConnectionCurve, type ConnectionCurve } from './connection-style'
import type { ConnectionItem } from './connections'
import {
  isAiImageNode,
  isAiVideoNode,
  type CanvasNode,
  type FrameNode,
} from './node-schema'
import { walkTreePruned, type Point } from './node-tree'
import type { Rect, Viewport } from './renderer-adapter'
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
}

function getCullingBounds(viewport: Viewport, options: ViewportCullingOptions): Rect {
  const overscan = Math.max(0, options.overscan ?? 1)
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

function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
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
  const bounds = getCullingBounds(viewport, options)
  const ids = new Set<string>()

  walkTreePruned(root, (node, absolute) => {
    if (!node.visible) return false
    if (
      intersects(bounds, {
        x: absolute.x,
        y: absolute.y,
        width: node.width,
        height: node.height,
      })
    ) {
      ids.add(node.fwId)
    }
  })

  return ids
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

/**
 * 连线独立按曲线包围盒裁剪。端点是否落在视口内不参与判断，避免漏掉横穿视口的线。
 */
export function getConnectionsInViewport(
  root: FrameNode,
  viewport: Viewport,
  options: ViewportCullingOptions,
): ConnectionItem[] {
  const bounds = getCullingBounds(viewport, options)
  const geometry = new Map<string, { node: CanvasNode; absolute: Point }>()

  walkTreePruned(root, (node, absolute) => {
    if (!node.visible) return false
    geometry.set(node.fwId, { node, absolute })
  })

  const connections: ConnectionItem[] = []
  for (const { node, absolute } of geometry.values()) {
    if (!isAiImageNode(node) && !isAiVideoNode(node)) continue
    for (const sourceFwId of node.sourceFwIds) {
      const source = geometry.get(sourceFwId)
      if (source === undefined) continue
      const curve = computeConnectionCurve(
        {
          x: source.absolute.x + source.node.width,
          y: source.absolute.y + source.node.height / 2,
        },
        { x: absolute.x, y: absolute.y + node.height / 2 },
      )
      if (!intersects(bounds, getConnectionBounds(curve))) continue
      connections.push({ fromFwId: sourceFwId, toFwId: node.fwId, curve })
    }
  }
  return connections
}
