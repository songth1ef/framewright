import {
  findNodeById,
  isFrameNode,
  walkTree,
  type CanvasNode,
  type FrameNode,
  type Point,
  type Rect,
  type RenderContext,
  type RendererAdapter,
  type RendererId,
} from '@framewright/core'
import {
  applyNodeChanges,
  MiniMap,
  ReactFlow,
  type NodeChange,
  type NodeMouseHandler,
  type OnNodeDrag,
  type OnSelectionChangeParams,
  type ReactFlowProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  getNodesInViewport,
  resolveViewportCullingLimits,
  resolveViewportSize,
} from '@framewright/core'
import { mapFrameToReactFlow, type ProbeEdge, type ProbeNode } from './mapping'
import { ProbeNodeView } from './probe-node'
import { REACT_FLOW_SHAPES } from './shape-registry'

export interface ReactFlowProbeOptions {
  onlyRenderVisibleElements?: boolean
  miniMap?: boolean
  /**
   * 喂给 React Flow 之前，先用**我们自己的** `getNodesInViewport` 预裁剪。
   *
   * 🔴 为什么需要这个开关：不开时把整棵树全喂进去，React Flow 每帧要对全部节点
   * 做可见性判定与测量（实测 1000 节点 3.2fps、100 节点 23.9fps，而屏幕上
   * 始终只画 6 个 —— 成本只随总数变化，与连线无关）。
   *
   * 而我们的 DOM / Leafer 渲染器是先裁剪再渲染。两边**画的不是同一批节点**，
   * 直接比帧率没有意义。开启后三方喂进去的是同一个可见集，对照才成立。
   *
   * 这也更接近真实集成形态：真要用 React Flow，我们同样会在外层做视口裁剪。
   */
  preCull?: boolean
}

const NODE_TYPES = { probe: ProbeNodeView }
const PROBE_RENDERER_ID = 'reactflow' as RendererId

interface ParentGeometry { parentFwId: string; parentAbsolute: Point }

function findParentGeometry(
  frame: FrameNode,
  targetFwId: string,
  frameAbsolute: Point = { x: frame.x, y: frame.y },
): ParentGeometry | null {
  for (const child of frame.children) {
    if (child.fwId === targetFwId) return { parentFwId: frame.fwId, parentAbsolute: frameAbsolute }
    if (isFrameNode(child)) {
      const found = findParentGeometry(child, targetFwId, {
        x: frameAbsolute.x + child.x,
        y: frameAbsolute.y + child.y,
      })
      if (found !== null) return found
    }
  }
  return null
}

function ProbeFlow({ ctx, options }: { ctx: RenderContext; options: ReactFlowProbeOptions }): ReactNode {
  const projection = useMemo(
    () => {
      const full = mapFrameToReactFlow(ctx.root, ctx.selection)
      if (options.preCull !== true) return full
      // 与 DOM / Leafer 同一口径：同一份 cullingLimits、同一个 overscan。
      const size = resolveViewportSize(ctx.viewportSize)
      if (size.width <= 0 || size.height <= 0) return full
      const mounted = getNodesInViewport(ctx.root, ctx.viewport, {
        width: size.width,
        height: size.height,
        ...resolveViewportCullingLimits(ctx.cullingLimits),
      })
      const nodes = full.nodes.filter((node) => mounted.has(node.id))
      const kept = new Set(nodes.map((node) => node.id))
      return {
        ...full,
        nodes,
        // 两端都被裁掉的边不该保留 —— 悬空边会让 React Flow 报错并影响计数
        edges: full.edges.filter((edge) => kept.has(edge.source) && kept.has(edge.target)),
      }
    },
    [ctx.root, ctx.selection, ctx.viewport, ctx.viewportSize, ctx.cullingLimits, options.preCull],
  )
  const [nodes, setNodes] = useState(projection.nodes)
  useEffect(() => setNodes(projection.nodes), [projection.nodes])

  const onNodesChange = (changes: NodeChange<ProbeNode>[]): void => {
    setNodes((current) => applyNodeChanges(changes, current))
  }
  const onNodeDragStop: OnNodeDrag<ProbeNode> = (_event, node) => {
    const original = findNodeById(ctx.root, node.id)
    const parent = findParentGeometry(ctx.root, node.id)
    if (original === null || parent === null) return
    ctx.callbacks.onNodesMove([{
      fwId: node.id,
      parentFwId: parent.parentFwId,
      x: node.position.x - parent.parentAbsolute.x,
      y: node.position.y - parent.parentAbsolute.y,
    }])
  }
  const onSelectionChange = ({ nodes: selected }: OnSelectionChangeParams<ProbeNode, ProbeEdge>): void => {
    ctx.callbacks.onSelectionRequest(selected.map((node) => node.id), 'replace')
  }
  const onNodeDoubleClick: NodeMouseHandler<ProbeNode> = (_event, node) => {
    ctx.callbacks.onNodeActivate(node.id)
  }
  const viewport: NonNullable<ReactFlowProps['viewport']> = {
    x: ctx.viewport.offsetX,
    y: ctx.viewport.offsetY,
    zoom: ctx.viewport.scale,
  }

  return (
    <ReactFlow<ProbeNode, ProbeEdge>
      nodes={nodes}
      edges={projection.edges}
      nodeTypes={NODE_TYPES}
      viewport={viewport}
      minZoom={0.05}
      maxZoom={4}
      onlyRenderVisibleElements={options.onlyRenderVisibleElements ?? true}
      nodesConnectable={false}
      edgesReconnectable={false}
      connectOnClick={false}
      deleteKeyCode={null}
      onNodesChange={onNodesChange}
      onNodeDragStop={onNodeDragStop}
      onSelectionChange={onSelectionChange}
      onNodeDoubleClick={onNodeDoubleClick}
      onViewportChange={(next) => {
        ctx.callbacks.onViewportChange({
          scale: next.zoom,
          offsetX: next.x,
          offsetY: next.y,
        })
      }}
      proOptions={{ hideAttribution: true }}
    >
      {options.miniMap ? <MiniMap pannable={false} zoomable={false} /> : null}
    </ReactFlow>
  )
}

function collectMetrics(root: FrameNode): { bounds: Map<string, Rect>; visible: string[] } {
  const bounds = new Map<string, Rect>()
  const visible: string[] = []
  walkTree(root, (node: CanvasNode, absolute: Point) => {
    bounds.set(node.fwId, {
      x: absolute.x,
      y: absolute.y,
      width: node.width,
      height: node.height,
    })
    if (node.visible) visible.push(node.fwId)
  })
  return { bounds, visible }
}

/**
 * 第三方测量探针。RendererId 的局部强转刻意暴露 core 契约目前不允许外部 renderer id。
 */
export function createReactFlowProbeRenderer(
  options: ReactFlowProbeOptions = {},
): RendererAdapter {
  // 模块加载时 shape registry 已执行 assertShapeCoverage；此引用防止 tree-shaking 抹掉意图。
  void REACT_FLOW_SHAPES
  let reactRoot: Root | null = null
  let bounds = new Map<string, Rect>()
  let visible: string[] = []

  const draw = (ctx: RenderContext): void => {
    if (reactRoot === null) return
    const metrics = collectMetrics(ctx.root)
    bounds = metrics.bounds
    visible = metrics.visible
    reactRoot.render(<ProbeFlow ctx={ctx} options={options} />)
  }

  return {
    id: PROBE_RENDERER_ID,
    displayName: 'React Flow（测量探针）',
    mount(container, ctx) {
      reactRoot = createRoot(container)
      draw(ctx)
    },
    update(ctx) {
      draw(ctx)
    },
    destroy() {
      reactRoot?.unmount()
      reactRoot = null
      bounds = new Map()
      visible = []
    },
    getRenderedBounds() {
      return new Map(bounds)
    },
    getVisibleNodeIds() {
      return [...visible]
    },
  }
}

export { mapFrameToReactFlow, ProbeNodeView, REACT_FLOW_SHAPES }
