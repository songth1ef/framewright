import {
  CONNECTION_STYLE,
  type ConnectionItem,
} from '@framewright/core'
import { Ellipse, Group, Path, type IUI } from 'leafer-ui'

// 🔴 collectConnectionItems / ConnectionItem 已收编进 core（packages/core/src/connections.ts）——
// 锚点提取规则两侧唯一真相源，本文件只保留 Leafer 专属的绘制层构建。
export type { ConnectionItem }

interface MountedConnection {
  path: Path
  endpoints: [Ellipse, Ellipse] | null
}

function keyedConnectionItems(items: readonly ConnectionItem[]): Array<[string, ConnectionItem]> {
  const occurrences = new Map<string, number>()
  return items.map((item) => {
    const baseKey = `${item.fromFwId}\u0000${item.toFwId}`
    const occurrence = occurrences.get(baseKey) ?? 0
    occurrences.set(baseKey, occurrence + 1)
    return [`${baseKey}\u0000${occurrence}`, item]
  })
}

function connectionStyle(
  item: ConnectionItem,
  selection: readonly string[],
  viewportScale: number,
): { stroke: string; strokeWidth: number } {
  const highlighted = selection.includes(item.fromFwId) || selection.includes(item.toFwId)
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

/** 长期存活的连线层：按端点 key 增删，已有连线只原地更新。 */
export class LeaferConnectionLayer {
  readonly ui = new Group({ hittable: false })
  private readonly mounted = new Map<string, MountedConnection>()

  reconcile(
    items: readonly ConnectionItem[],
    selection: readonly string[],
    viewportScale: number,
  ): void {
    const keyedItems = keyedConnectionItems(items)
    const desiredKeys = new Set(keyedItems.map(([key]) => key))
    for (const [key, mounted] of this.mounted) {
      if (desiredKeys.has(key)) continue
      mounted.path.remove()
      mounted.path.destroy()
      mounted.endpoints?.forEach((endpoint) => {
        endpoint.remove()
        endpoint.destroy()
      })
      this.mounted.delete(key)
    }

    keyedItems.forEach(([key, item], index) => {
      let mounted = this.mounted.get(key)
      if (mounted === undefined) {
        mounted = this.create(item, selection, viewportScale)
        this.mounted.set(key, mounted)
      } else {
        this.update(mounted, item, selection, viewportScale)
      }
      const childIndex = index * (CONNECTION_STYLE.endpointRadius > 0 ? 3 : 1)
      this.ui.add(mounted.path, childIndex)
      mounted.endpoints?.forEach((endpoint, endpointIndex) => {
        this.ui.add(endpoint, childIndex + endpointIndex + 1)
      })
    })
  }

  destroy(): void {
    this.mounted.clear()
    this.ui.remove()
    this.ui.destroy()
  }

  private create(
    item: ConnectionItem,
    selection: readonly string[],
    viewportScale: number,
  ): MountedConnection {
    const path = new Path({ path: curvePath(item), ...connectionStyle(item, selection, viewportScale) })
    let endpoints: MountedConnection['endpoints'] = null
    if (CONNECTION_STYLE.endpointRadius > 0) {
      const diameter = CONNECTION_STYLE.endpointRadius * 2
      const [p0, p3] = [item.curve.p0, item.curve.p3]
      endpoints = [
        new Ellipse({
          x: p0.x - CONNECTION_STYLE.endpointRadius,
          y: p0.y - CONNECTION_STYLE.endpointRadius,
          width: diameter,
          height: diameter,
          fill: CONNECTION_STYLE.endpointColor,
        }),
        new Ellipse({
          x: p3.x - CONNECTION_STYLE.endpointRadius,
          y: p3.y - CONNECTION_STYLE.endpointRadius,
          width: diameter,
          height: diameter,
          fill: CONNECTION_STYLE.endpointColor,
        }),
      ]
    }
    return { path, endpoints }
  }

  private update(
    mounted: MountedConnection,
    item: ConnectionItem,
    selection: readonly string[],
    viewportScale: number,
  ): void {
    mounted.path.set({
      path: curvePath(item),
      ...connectionStyle(item, selection, viewportScale),
    })
    if (mounted.endpoints !== null) {
      const diameter = CONNECTION_STYLE.endpointRadius * 2
      const updateEndpoint = (endpoint: ConnectionItem['curve']['p0'], ui: Ellipse): void => {
        ui.set({
          x: endpoint.x - CONNECTION_STYLE.endpointRadius,
          y: endpoint.y - CONNECTION_STYLE.endpointRadius,
          width: diameter,
          height: diameter,
          fill: CONNECTION_STYLE.endpointColor,
        })
      }
      updateEndpoint(item.curve.p0, mounted.endpoints[0])
      updateEndpoint(item.curve.p3, mounted.endpoints[1])
    }
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
): IUI {
  const layer = new LeaferConnectionLayer()
  layer.reconcile(items, selection, viewportScale)
  return layer.ui
}
