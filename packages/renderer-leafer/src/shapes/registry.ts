import {
  assertShapeCoverage,
  isBoxNode,
  isFrameNode,
  type CanvasNode,
  type Point,
  type ShapeType,
} from '@framewright/core'
import { Box, Rect, type IUI } from 'leafer-ui'
import { toLeaferProps } from '../node-props'
import { createGenerationUnitShape } from './generation-unit'

export interface ShapeContext {
  node: CanvasNode
  position: Point
  /** 拖拽/缩放预览的尺寸覆盖；缺省用 node 自身宽高 */
  size?: { width: number; height: number }
  selected: boolean
}

/** 返回一个 Leafer 节点；frame 返回容器（可 add 子节点），其余返回叶子。 */
export type ShapeFactory = (ctx: ShapeContext) => IUI

const SELECTED_STROKE = '#5B8091'

export function applySelection(ui: IUI, selected: boolean): IUI {
  if (selected) {
    ui.stroke = SELECTED_STROKE
    ui.strokeWidth = 2
  }
  return ui
}

const createFrame: ShapeFactory = ({ node, position, size, selected }) => {
  const box = new Box({
    ...toLeaferProps(node, position, size),
    fill: isFrameNode(node) && node.background !== null ? node.background : undefined,
    overflow: isFrameNode(node) && node.clip ? 'hide' : 'show',
  })
  return applySelection(box, selected)
}

const createBox: ShapeFactory = ({ node, position, size, selected }) => {
  const rect = new Rect({
    ...toLeaferProps(node, position, size),
    fill: isBoxNode(node) ? node.fill : undefined,
    cornerRadius: isBoxNode(node) ? node.cornerRadius : 0,
  })
  return applySelection(rect, selected)
}

/**
 * P0 尚未实现的 shape 的显式占位——与 renderer-dom 的 unsupported 占位对应。
 * 留空会让 assertShapeCoverage 报错，这是刻意的。
 */
function makeUnsupportedShape(): ShapeFactory {
  return ({ node, position, size, selected }) => {
    const rect = new Rect({
      ...toLeaferProps(node, position, size),
      fill: '#DDDDDD',
      stroke: '#999999',
      strokeWidth: 1,
      dashPattern: [4, 4],
    })
    return applySelection(rect, selected)
  }
}

export const LEAFER_SHAPES: Record<ShapeType, ShapeFactory> = {
  frame: createFrame,
  box: createBox,
  img: makeUnsupportedShape(),
  video: makeUnsupportedShape(),
  'ai-image': createGenerationUnitShape(),
  'ai-video': createGenerationUnitShape(),
}

assertShapeCoverage('leafer', LEAFER_SHAPES)
