import { isFrameNode, type CanvasNode, type FrameNode } from './node-schema'
import type { Point } from './node-tree'
import type { Rect } from './renderer-adapter'

export type Corner = 'nw' | 'ne' | 'sw' | 'se'

export interface NodeMove {
  fwId: string
  parentFwId: string
  x: number
  y: number
}

/**
 * 由选中集 + 画布 delta 算出提交参数（父相对坐标），对应契约 onNodesMove。
 * 职责：① 父子同选只保留最上层（任一祖先在选中集里就跳过，否则后代被移动两次）
 *       ② 排除 locked  ③ 输出父相对坐标 + parentFwId
 *
 * ⚠️ 前提：父节点没有旋转/缩放——父不动，故父相对增量 == 画布增量。
 * 将来父节点支持旋转时，这里要做逆变换（契约裁决 9：首版按 AABB）。
 */
export function computeMoves(
  root: FrameNode,
  selection: readonly string[],
  deltaCanvas: Point,
): readonly NodeMove[] {
  const selected = new Set(selection)
  const moves: NodeMove[] = []
  const visit = (node: CanvasNode, parent: FrameNode | null, ancestorSelected: boolean): void => {
    const isSelected = selected.has(node.fwId)
    if (isSelected && !ancestorSelected && !node.locked && parent !== null) {
      moves.push({
        fwId: node.fwId,
        parentFwId: parent.fwId,
        x: node.x + deltaCanvas.x,
        y: node.y + deltaCanvas.y,
      })
    }
    if (isFrameNode(node)) {
      for (const child of node.children) {
        visit(child, node, ancestorSelected || isSelected)
      }
    }
  }
  visit(root, null, false)
  return moves
}

const OPPOSITE_CORNER: Record<Corner, Corner> = {
  nw: 'se',
  ne: 'sw',
  sw: 'ne',
  se: 'nw',
}

function cornerPoint(rect: Rect, corner: Corner): Point {
  switch (corner) {
    case 'nw':
      return { x: rect.x, y: rect.y }
    case 'ne':
      return { x: rect.x + rect.width, y: rect.y }
    case 'sw':
      return { x: rect.x, y: rect.y + rect.height }
    case 'se':
      return { x: rect.x + rect.width, y: rect.y + rect.height }
  }
}

/**
 * 等比缩放：固定对角，按角点位置算新 rect。只有四角，没有边中点
 * （interaction-spec §3：生成结果不允许被自由拉伸变形）。
 *
 * 口径选择（钉死）：宽向与高向两个缩放因子中**取较大者**——拖动主导轴跟手，
 * 且最大化「不小于 minSize」的机会；随后按 minSize 钳制并保持原比例。
 */
export function resizeProportional(
  orig: Rect,
  corner: Corner,
  pointerCanvas: Point,
  opts: { minSize: number },
): Rect {
  const ratio = orig.width / orig.height
  const fixedCorner = OPPOSITE_CORNER[corner]
  const fixed = cornerPoint(orig, fixedCorner)

  const scale = Math.max(
    Math.abs(pointerCanvas.x - fixed.x) / orig.width,
    Math.abs(pointerCanvas.y - fixed.y) / orig.height,
  )
  let width = orig.width * scale
  let height = orig.height * scale
  if (width < opts.minSize) {
    width = opts.minSize
    height = width / ratio
  }
  if (height < opts.minSize) {
    height = opts.minSize
    width = height * ratio
  }

  const x = fixedCorner === 'nw' || fixedCorner === 'sw' ? fixed.x : fixed.x - width
  const y = fixedCorner === 'nw' || fixedCorner === 'ne' ? fixed.y : fixed.y - height
  return { x, y, width, height }
}
