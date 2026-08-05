import {
  CONNECTION_STYLE,
  type ConnectionItem,
  type ConnectionDetailLevel,
} from '@framewright/core'
import { Group, Path, type IUI } from 'leafer-ui'

// 🔴 collectConnectionItems / ConnectionItem 已收编进 core（packages/core/src/connections.ts）——
// 锚点提取规则两侧唯一真相源，本文件只保留 Leafer 专属的绘制层构建。
export type { ConnectionItem }

function connectionStyle(
  highlighted: boolean,
  viewportScale: number,
): { stroke: string; strokeWidth: number } {
  return {
    stroke: highlighted ? CONNECTION_STYLE.highlightColor : CONNECTION_STYLE.strokeColor,
    strokeWidth:
      (highlighted ? CONNECTION_STYLE.highlightWidth : CONNECTION_STYLE.strokeWidth) /
      viewportScale,
  }
}

function curvePath(item: ConnectionItem): string {
  const { p0, c1, c2, p3 } = item.curve
  return `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p3.x} ${p3.y}`
}

function connectionPath(item: ConnectionItem, detail: ConnectionDetailLevel): string {
  if (detail === 'line') {
    const { p0, p3 } = item.curve
    return `M ${p0.x} ${p0.y} L ${p3.x} ${p3.y}`
  }
  return curvePath(item)
}

function endpointCirclePath(x: number, y: number, radius: number): string {
  return `M ${x - radius} ${y} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${radius * -2} 0`
}

/** 长期存活的连线层：按端点 key 增删，已有连线只原地更新。 */
export class LeaferConnectionLayer {
  readonly ui = new Group({ hittable: false })
  private readonly mounted = new Map<string, Path>()
  mountedConnectionCount = 0

  reconcile(
    items: readonly ConnectionItem[],
    selection: readonly string[],
    viewportScale: number,
    detail: ConnectionDetailLevel = 'curve',
  ): void {
    this.mountedConnectionCount = detail === 'hidden' ? 0 : items.length
    const selected = new Set(selection)
    const normalItems: ConnectionItem[] = []
    const highlightedItems: ConnectionItem[] = []
    if (detail !== 'hidden') {
      for (const item of items) {
        const target = selected.has(item.fromFwId) || selected.has(item.toFwId)
          ? highlightedItems
          : normalItems
        target.push(item)
      }
    }

    const desired = new Map<string, { path: string; stroke?: string; strokeWidth?: number; fill?: string }>()
    for (const [key, batchItems, highlighted] of [
      ['normal-strokes', normalItems, false],
      ['highlighted-strokes', highlightedItems, true],
    ] as const) {
      if (batchItems.length === 0) continue
      desired.set(key, {
        path: batchItems.map((item) => connectionPath(item, detail)).join(' '),
        ...connectionStyle(highlighted, viewportScale),
      })
    }
    if (detail === 'curve' && CONNECTION_STYLE.endpointRadius > 0 && items.length > 0) {
      desired.set('endpoints', {
        path: items.flatMap((item) => [item.curve.p0, item.curve.p3])
          .map((point) => endpointCirclePath(
            point.x,
            point.y,
            CONNECTION_STYLE.endpointRadius,
          ))
          .join(' '),
        fill: CONNECTION_STYLE.endpointColor,
      })
    }

    for (const [key, mounted] of this.mounted) {
      if (desired.has(key)) continue
      mounted.remove()
      mounted.destroy()
      this.mounted.delete(key)
    }
    let index = 0
    for (const [key, attributes] of desired) {
      let mounted = this.mounted.get(key)
      if (mounted === undefined) {
        mounted = new Path(attributes)
        this.mounted.set(key, mounted)
      } else {
        mounted.set(attributes)
      }
      this.ui.add(mounted, index)
      index += 1
    }
  }

  destroy(): void {
    this.mounted.clear()
    this.mountedConnectionCount = 0
    this.ui.remove()
    this.ui.destroy()
  }
}

/**
 * 把连线画成一个独立的层（Group），调用方负责把它加在**所有节点之下**（规格 §2）。
 *
 * - 连线不是 node：不进 node 树、不可命中（hittable: false）、不进 getRenderedBounds()
 * - 🔴 strokeWidth 恒为视觉像素宽度（规格 §7）：按 1 / viewportScale 反向补偿
 * - 任一端节点在选中集里时整条线高亮（规格 §6）
 */
export function buildConnectionLayer(
  items: readonly ConnectionItem[],
  selection: readonly string[],
  viewportScale: number,
  detail: ConnectionDetailLevel = 'curve',
): IUI {
  const layer = new LeaferConnectionLayer()
  layer.reconcile(items, selection, viewportScale, detail)
  return layer.ui
}
