import {
  CONNECTION_STYLE,
  computeConnectionCurve,
  isAiImageNode,
  isAiVideoNode,
  walkTree,
  type ConnectionCurve,
  type ConnectionDetailLevel,
  type FrameNode,
  type Rect,
} from '@framewright/core'
import type { ReactNode } from 'react'

export interface ConnectionItem {
  fromFwId: string
  toFwId: string
  curve: ConnectionCurve
}

/** 将 node 树投影成连线绘制数据；曲线形态只调用 core 的共享实现。 */
export function collectConnectionItems(root: FrameNode): ConnectionItem[] {
  const geometries = new Map<string, Rect>()
  const generationNodes: Array<{
    fwId: string
    sourceFwIds: readonly string[]
    bounds: Rect
  }> = []

  walkTree(root, (node, absolute) => {
    const bounds: Rect = {
      x: absolute.x,
      y: absolute.y,
      width: node.width,
      height: node.height,
    }
    geometries.set(node.fwId, bounds)
    if (isAiImageNode(node) || isAiVideoNode(node)) {
      generationNodes.push({ fwId: node.fwId, sourceFwIds: node.sourceFwIds, bounds })
    }
  })

  const items: ConnectionItem[] = []
  for (const target of generationNodes) {
    for (const sourceFwId of target.sourceFwIds) {
      const source = geometries.get(sourceFwId)
      if (source === undefined) continue
      items.push({
        fromFwId: sourceFwId,
        toFwId: target.fwId,
        curve: computeConnectionCurve(
          { x: source.x + source.width, y: source.y + source.height / 2 },
          { x: target.bounds.x, y: target.bounds.y + target.bounds.height / 2 },
        ),
      })
    }
  }
  return items
}

export interface ConnectionLayerProps {
  items: readonly ConnectionItem[]
  selection: readonly string[]
  scale: number
  rootBounds: Rect
  detail: Exclude<ConnectionDetailLevel, 'hidden'>
}

function curvePath(curve: ConnectionCurve): string {
  return `M ${curve.p0.x} ${curve.p0.y} C ${curve.c1.x} ${curve.c1.y}, ${curve.c2.x} ${curve.c2.y}, ${curve.p3.x} ${curve.p3.y}`
}

function linePath(curve: ConnectionCurve): string {
  return `M ${curve.p0.x} ${curve.p0.y} L ${curve.p3.x} ${curve.p3.y}`
}

function endpointCirclePath(x: number, y: number, radius: number): string {
  return `M ${x - radius} ${y} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${radius * -2} 0`
}

export function ConnectionLayer({
  items,
  selection,
  scale,
  rootBounds,
  detail,
}: ConnectionLayerProps): ReactNode {
  const safeScale = scale > 0 ? scale : 1
  const radius = CONNECTION_STYLE.endpointRadius / safeScale
  const selected = new Set(selection)
  const normalItems: ConnectionItem[] = []
  const highlightedItems: ConnectionItem[] = []
  for (const item of items) {
    const target = selected.has(item.fromFwId) || selected.has(item.toFwId)
      ? highlightedItems
      : normalItems
    target.push(item)
  }
  const batches = [
    { key: 'normal', items: normalItems, highlighted: false },
    { key: 'highlighted', items: highlightedItems, highlighted: true },
  ] as const

  return (
    <svg
      data-fw-connections="true"
      viewBox={`${rootBounds.x} ${rootBounds.y} ${rootBounds.width} ${rootBounds.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        pointerEvents: 'none',
      }}
    >
      {batches.map(({ key, items: batchItems, highlighted }) => {
        if (batchItems.length === 0) return null
        const color = highlighted
          ? CONNECTION_STYLE.highlightColor
          : CONNECTION_STYLE.strokeColor
        const width =
          (highlighted ? CONNECTION_STYLE.highlightWidth : CONNECTION_STYLE.strokeWidth) /
          safeScale
        const strokePath = batchItems
          .map((item) => detail === 'line' ? linePath(item.curve) : curvePath(item.curve))
          .join(' ')
        const endpointPath = detail === 'curve' && CONNECTION_STYLE.endpointRadius > 0
          ? batchItems.flatMap((item) => [item.curve.p0, item.curve.p3])
              .map((point) => endpointCirclePath(point.x, point.y, radius))
              .join(' ')
          : null
        return (
          <g key={key}>
            <path
              data-fw-connection-strokes={key}
              data-fw-connection-count={batchItems.length}
              d={strokePath}
              fill="none"
              stroke={color}
              strokeWidth={width}
            />
            {endpointPath === null ? null : (
              <path
                data-fw-connection-endpoints={key}
                d={endpointPath}
                fill={highlighted ? CONNECTION_STYLE.highlightColor : CONNECTION_STYLE.endpointColor}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
