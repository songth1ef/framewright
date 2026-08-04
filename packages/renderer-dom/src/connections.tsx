import {
  CONNECTION_STYLE,
  computeConnectionCurve,
  isAiImageNode,
  isAiVideoNode,
  walkTree,
  type ConnectionCurve,
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
}

function curvePath(curve: ConnectionCurve): string {
  return `M ${curve.p0.x} ${curve.p0.y} C ${curve.c1.x} ${curve.c1.y}, ${curve.c2.x} ${curve.c2.y}, ${curve.p3.x} ${curve.p3.y}`
}

export function ConnectionLayer({
  items,
  selection,
  scale,
  rootBounds,
}: ConnectionLayerProps): ReactNode {
  const safeScale = scale > 0 ? scale : 1
  const radius = CONNECTION_STYLE.endpointRadius / safeScale

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
      {items.map((item, index) => {
        const highlighted =
          selection.includes(item.fromFwId) || selection.includes(item.toFwId)
        const color = highlighted
          ? CONNECTION_STYLE.highlightColor
          : CONNECTION_STYLE.strokeColor
        const width =
          (highlighted ? CONNECTION_STYLE.highlightWidth : CONNECTION_STYLE.strokeWidth) /
          safeScale
        return (
          <g key={`${item.fromFwId}:${item.toFwId}:${index}`}>
            <path
              data-fw-connection-from={item.fromFwId}
              data-fw-connection-to={item.toFwId}
              d={curvePath(item.curve)}
              fill="none"
              stroke={color}
              strokeWidth={width}
            />
            {CONNECTION_STYLE.endpointRadius > 0 ? (
              <>
                <circle
                  cx={item.curve.p0.x}
                  cy={item.curve.p0.y}
                  r={radius}
                  fill={highlighted ? CONNECTION_STYLE.highlightColor : CONNECTION_STYLE.endpointColor}
                />
                <circle
                  cx={item.curve.p3.x}
                  cy={item.curve.p3.y}
                  r={radius}
                  fill={highlighted ? CONNECTION_STYLE.highlightColor : CONNECTION_STYLE.endpointColor}
                />
              </>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}
