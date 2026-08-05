import {
  GEN_UNIT_STYLE,
  assertShapeCoverage,
  isAiImageNode,
  isAiVideoNode,
  isBoxNode,
  isFrameNode,
  isImgNode,
  isVideoNode,
  type CanvasNode,
  type Point,
  type ShapeType,
} from '@framewright/core'
import { Box, Rect, type IUI } from 'leafer-ui'
import { toLeaferProps } from '../node-props'
import { createVideoShape } from '../video/video-node'
import { createGenerationUnitShape } from './generation-unit'
import { createImageShape } from './image'

export interface ShapeContext {
  node: CanvasNode
  position: Point
  /** 拖拽/缩放预览的尺寸覆盖；缺省用 node 自身宽高 */
  size?: { width: number; height: number }
  selected: boolean
}

/** 返回一个 Leafer 节点；frame 返回容器（可 add 子节点），其余返回叶子。 */
export type ShapeFactory = (ctx: ShapeContext) => IUI

// 🔴 shape 不画选中描边——选中/hover 视觉统一由 interaction-overlay 以 1/scale 补偿绘制
// （D5；scaleFixed 对 strokeWidth 不生效，见 docs/lessons.md 踩坑 2）。
// ShapeContext.selected 保留在入参里（与 DOM 侧 ShapeProps 对齐），但此处不再消费。

const createFrame: ShapeFactory = ({ node, position, size }) => {
  return new Box({
    ...toLeaferProps(node, position, size),
    fill: isFrameNode(node) && node.background !== null ? node.background : undefined,
    overflow: isFrameNode(node) && node.clip ? 'hide' : 'show',
  })
}

const createBox: ShapeFactory = ({ node, position, size }) => {
  return new Rect({
    ...toLeaferProps(node, position, size),
    fill: isBoxNode(node) ? node.fill : undefined,
    cornerRadius: isBoxNode(node) ? node.cornerRadius : 0,
  })
}

export const LEAFER_SHAPES: Record<ShapeType, ShapeFactory> = {
  frame: createFrame,
  box: createBox,
  img: createImageShape(),
  video: createVideoShape(),
  'ai-image': createGenerationUnitShape(),
  'ai-video': createGenerationUnitShape(),
}

function replaceChildren(target: IUI, replacement: IUI): void {
  for (const child of [...(target.children ?? [])]) {
    child.remove()
    child.destroy()
  }
  for (const child of [...(replacement.children ?? [])]) {
    child.remove()
    target.add(child)
  }
  replacement.destroy()
}

function generationContentChanged(previous: CanvasNode, next: CanvasNode): boolean {
  if (
    (!isAiImageNode(previous) && !isAiVideoNode(previous)) ||
    (!isAiImageNode(next) && !isAiVideoNode(next))
  ) {
    return true
  }
  const previousUrl = isAiImageNode(previous) ? previous.src : previous.poster
  const nextUrl = isAiImageNode(next) ? next.src : next.poster
  return (
    previous.status !== next.status ||
    previous.prompt !== next.prompt ||
    previous.errorMessage !== next.errorMessage ||
    previous.fit !== next.fit ||
    previousUrl !== nextUrl
  )
}

/** 保留已挂载的外层 Leafer 实例，显式更新几何与节点内容。 */
export function updateLeaferShape(
  ui: IUI,
  previousNode: CanvasNode,
  ctx: ShapeContext,
): void {
  const { node, position, size } = ctx
  const geometry = toLeaferProps(node, position, size)
  switch (node.fwType) {
    case 'frame':
      ui.set({
        ...geometry,
        fill: isFrameNode(node) ? node.background ?? undefined : undefined,
        overflow: isFrameNode(node) && node.clip ? 'hide' : 'show',
      })
      break
    case 'box':
      ui.set({
        ...geometry,
        fill: isBoxNode(node) ? node.fill : undefined,
        cornerRadius: isBoxNode(node) ? node.cornerRadius : 0,
      })
      break
    case 'img': {
      const empty = !isImgNode(node) || node.src === ''
      const mode = isImgNode(node)
        ? node.fit === 'cover' ? 'cover' : node.fit === 'fill' ? 'stretch' : 'fit'
        : 'fit'
      ui.set({
        ...geometry,
        fill: empty ? '#DDDDDD' : { type: 'image', url: node.src, mode },
        stroke: empty ? '#999999' : undefined,
        strokeWidth: empty ? 1 : 0,
        dashPattern: empty ? [4, 4] : undefined,
      })
      break
    }
    case 'ai-image':
    case 'ai-video': {
      const layoutChanged =
        previousNode.width !== (size?.width ?? node.width) ||
        previousNode.height !== (size?.height ?? node.height)
      ui.set({
        ...geometry,
        cornerRadius: GEN_UNIT_STYLE.cornerRadius,
        overflow: 'hide',
        stroke: node.status === 'failed'
          ? GEN_UNIT_STYLE.failedBorderColor
          : GEN_UNIT_STYLE.borderColor,
        strokeWidth: GEN_UNIT_STYLE.borderWidth,
        dashPattern: node.status === 'empty' ? [4, 4] : undefined,
      })
      if (layoutChanged || generationContentChanged(previousNode, node)) {
        replaceChildren(ui, LEAFER_SHAPES[node.fwType](ctx))
      }
      break
    }
    case 'video': {
      ui.set({ ...geometry, fill: '#000000', overflow: 'hide' })
      const contentChanged =
        !isVideoNode(previousNode) ||
        !isVideoNode(node) ||
        previousNode.src !== node.src ||
        previousNode.fit !== node.fit ||
        previousNode.width !== (size?.width ?? node.width) ||
        previousNode.height !== (size?.height ?? node.height)
      if (contentChanged) replaceChildren(ui, LEAFER_SHAPES.video(ctx))
      break
    }
  }
}

assertShapeCoverage('leafer', LEAFER_SHAPES)
