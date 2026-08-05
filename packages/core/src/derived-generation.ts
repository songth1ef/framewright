import { applyOp, type CanvasOp } from './history'
import {
  createAiImageNode,
  createAiVideoNode,
  type AiImageNode,
  type CanvasNode,
  type FrameNode,
  isFrameNode,
} from './node-schema'
import { findNodeById } from './node-tree'

/** 派生结果与来源之间的留白；位置由 core 决定，渲染器只消费 node 几何。 */
export const DERIVED_NODE_GAP = 24

export interface DerivedGenerationInput {
  fwId: string
  fwType: 'ai-image' | 'ai-video'
  generationId?: string | null
  prompt: string
  params: Record<string, unknown>
  name?: string
  width?: number
  height?: number
}

type AddNodeOp = Extract<CanvasOp, { kind: 'add-node' }>
type BatchOp = Extract<CanvasOp, { kind: 'batch' }>

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function findParentFrame(root: FrameNode, fwId: string): FrameNode | null {
  for (const child of root.children) {
    if (child.fwId === fwId) return root
    if (isFrameNode(child)) {
      const parent = findParentFrame(child, fwId)
      if (parent !== null) return parent
    }
  }
  return null
}

function overlaps(left: Rect, right: Rect): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  )
}

/**
 * 摆放规则：与源节点保持同一父级，首选源节点右侧 24px；若与兄弟节点重叠，
 * 保持该列并按“结果高度 + 24px”向下搜索，直到出现首个空位。
 * 这样既保留来源附近的空间关系，又是确定性的，并且无需引入布局引擎。
 */
function findDerivedPosition(
  parent: FrameNode,
  source: AiImageNode,
  width: number,
  height: number,
): { x: number; y: number } {
  const x = source.x + source.width + DERIVED_NODE_GAP
  let y = source.y
  const obstacles: Rect[] = parent.children.map((node) => ({
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  }))

  while (obstacles.some((obstacle) => overlaps({ x, y, width, height }, obstacle))) {
    y += height + DERIVED_NODE_GAP
  }
  return { x, y }
}

function createDerivedNode(source: AiImageNode, input: DerivedGenerationInput): CanvasNode {
  const common = {
    fwId: input.fwId,
    generationId: input.generationId ?? null,
    status: 'pending' as const,
    prompt: input.prompt,
    params: { ...input.params },
    sourceFwIds: [source.fwId],
    width: input.width ?? source.width,
    height: input.height ?? source.height,
    fit: source.fit,
    ...(input.name === undefined ? {} : { name: input.name }),
  }

  return input.fwType === 'ai-image'
    ? createAiImageNode(common)
    : createAiVideoNode(common)
}

/**
 * 构造一次“基于已生成图片再生成”的可撤销操作。
 * 连线不是额外操作：它由新节点的 sourceFwIds 派生渲染。
 */
export function createDerivedGenerationOp(
  root: FrameNode,
  source: AiImageNode,
  input: DerivedGenerationInput,
): AddNodeOp {
  const actualSource = findNodeById(root, source.fwId)
  if (actualSource?.fwType !== 'ai-image') {
    throw new Error(`派生来源必须是画布中的 ai-image 节点：${source.fwId}`)
  }
  if (findNodeById(root, input.fwId) !== null) {
    throw new Error(`派生节点 fwId 已存在：${input.fwId}`)
  }

  const parent = findParentFrame(root, actualSource.fwId)
  if (parent === null) {
    throw new Error(`找不到派生来源的父节点：${actualSource.fwId}`)
  }
  const node = createDerivedNode(actualSource, input)
  const position = findDerivedPosition(parent, actualSource, node.width, node.height)

  return {
    kind: 'add-node',
    slot: {
      parentFwId: parent.fwId,
      index: parent.children.length,
      ...position,
    },
    node: { ...node, ...position } as CanvasNode,
    // 新建节点尚无其它节点指向它；其指向来源的出边在 node.sourceFwIds 中。
    inboundRefs: [],
  }
}

/** 多个派生结果属于一次用户动作，以单层 batch 表达并整体撤销。 */
export function createDerivedGenerationBatchOp(
  root: FrameNode,
  source: AiImageNode,
  inputs: readonly DerivedGenerationInput[],
): BatchOp {
  const ops: AddNodeOp[] = []
  let nextRoot = root
  for (const input of inputs) {
    const op = createDerivedGenerationOp(nextRoot, source, input)
    ops.push(op)
    nextRoot = applyOp(nextRoot, op)
  }
  return { kind: 'batch', ops }
}
