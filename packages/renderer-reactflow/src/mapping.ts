import {
  isAiImageNode,
  isAiVideoNode,
  isBoxNode,
  isFrameNode,
  isImgNode,
  isVideoNode,
  walkTree,
  type CanvasNode,
  type FrameNode,
  type ObjectFit,
  type Point,
} from '@framewright/core'
import type { Edge, Node } from '@xyflow/react'
import type { CSSProperties } from 'react'

export type ProbeNodeData = Record<string, unknown> & {
  shape: 'frame' | 'box' | 'img' | 'video' | 'ai-image' | 'ai-video' | 'unsupported'
  fill?: string
  src?: string | null
  poster?: string | null
  fit?: ObjectFit
  unsupportedShape?: string
  rotation: number
}

export type ProbeNode = Node<ProbeNodeData, 'probe'>
export type ProbeEdge = Edge<Record<string, never>, 'default'>

function mapData(node: CanvasNode): ProbeNodeData {
  if (isFrameNode(node)) return { shape: 'frame', fill: node.background ?? 'transparent', rotation: node.rotation }
  if (isBoxNode(node)) return { shape: 'box', fill: node.fill, rotation: node.rotation }
  if (isImgNode(node)) return { shape: 'img', src: node.src, fit: node.fit, rotation: node.rotation }
  if (isVideoNode(node)) {
    return { shape: 'video', src: node.src, poster: node.poster, fit: node.fit, rotation: node.rotation }
  }
  if (isAiImageNode(node)) {
    return { shape: 'ai-image', src: node.src, fit: node.fit, rotation: node.rotation }
  }
  if (isAiVideoNode(node)) {
    return { shape: 'ai-video', src: node.src, poster: node.poster, fit: node.fit, rotation: node.rotation }
  }
  return { shape: 'unsupported', unsupportedShape: node.fwType, rotation: node.rotation }
}

function mapStyle(node: CanvasNode): CSSProperties {
  return {
    width: node.width,
    height: node.height,
    opacity: node.opacity,
  }
}

function mapNode(node: CanvasNode, absolute: Point, selected: boolean): ProbeNode {
  return {
    id: node.fwId,
    type: 'probe',
    position: { x: absolute.x, y: absolute.y },
    width: node.width,
    height: node.height,
    initialWidth: node.width,
    initialHeight: node.height,
    hidden: !node.visible,
    selected,
    draggable: !node.locked,
    selectable: !node.locked,
    connectable: false,
    data: mapData(node),
    style: mapStyle(node),
  }
}

export interface ReactFlowProjection {
  nodes: ProbeNode[]
  edges: ProbeEdge[]
}

/** 把树打平成 React Flow 图；位置转为画布绝对坐标，避免把 parentId 子流语义混进探针。 */
export function mapFrameToReactFlow(
  root: FrameNode,
  selection: readonly string[],
): ReactFlowProjection {
  const selected = new Set(selection)
  const nodes: ProbeNode[] = []
  const edges: ProbeEdge[] = []
  const pairOccurrences = new Map<string, number>()

  walkTree(root, (node, absolute) => {
    // React Flow 的 pane 自己就是根画布；把 root frame 也做成 node 会遮住 pane，原生平移无法命中。
    if (node.fwId === root.fwId) return
    nodes.push(mapNode(node, absolute, selected.has(node.fwId)))
    if (!isAiImageNode(node) && !isAiVideoNode(node)) return
    for (const source of node.sourceFwIds) {
      const pair = `${source}->${node.fwId}`
      const occurrence = pairOccurrences.get(pair) ?? 0
      pairOccurrences.set(pair, occurrence + 1)
      edges.push({
        id: `${pair}:${occurrence}`,
        source,
        target: node.fwId,
        type: 'default',
        selectable: false,
        focusable: false,
        data: {},
      })
    }
  })

  return { nodes, edges }
}
