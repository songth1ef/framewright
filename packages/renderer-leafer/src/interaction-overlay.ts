import type { Corner, Rect } from '@framewright/core'
import { Group, Rect as LeaferRect, type IUI } from 'leafer-ui'
import type { CanvasInteractionPreview } from './canvas-interaction'

const SELECTION_COLOR = '#5B8091'
const SELECTION_WIDTH_CSS_PX = 2
const HOVER_COLOR = 'rgba(91, 128, 145, 0.45)'
const MARQUEE_FILL = 'rgba(91, 128, 145, 0.15)'
const HANDLE_FILL = '#FFFFFF'

/** 控制点视觉尺寸（CSS px）——画布尺寸需按 1/scale 换算，见下方补偿说明 */
const HANDLE_SIZE_CSS_PX = 8

const HANDLE_CORNERS: readonly Corner[] = ['nw', 'ne', 'sw', 'se']

export interface InteractionOverlayInput {
  preview: CanvasInteractionPreview
  /** 选中集各节点的画布绝对包围盒（长度 1 = 单选） */
  selectionBounds: ReadonlyArray<{ fwId: string; rect: Rect }>
  /** 悬停节点的画布绝对包围盒 */
  hoverBounds: { fwId: string; rect: Rect } | null
  viewportScale: number
}

function unionRects(items: ReadonlyArray<{ rect: Rect }>): Rect | null {
  if (items.length === 0) return null
  const first = items[0]!.rect
  let left = first.x
  let top = first.y
  let right = first.x + first.width
  let bottom = first.y + first.height
  for (const { rect } of items.slice(1)) {
    left = Math.min(left, rect.x)
    top = Math.min(top, rect.y)
    right = Math.max(right, rect.x + rect.width)
    bottom = Math.max(bottom, rect.y + rect.height)
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * 交互 overlay：框选框 / 选中描边 / 控制点等纯呈现反馈（不进 node 树）。
 * 由调用方加在**所有节点之上**（对比连线层在 root 内第一个孩子，见 lessons 踩坑 3）。
 *
 * - 🔴 描边宽度恒为视觉像素（interaction-spec §5）：按 1 / viewportScale 反向补偿——
 *   scaleFixed 对 strokeWidth 不生效（lessons 踩坑 2 实测），没有声明式捷径
 * - 层自身是 Group（非 branchLeaf，永不自命中）；装饰元素逐个 hittable:false，
 *   控制点（D3 引入）保持可命中。🔴 不能整层 hittable:false——worldHittable 沿父链
 *   检查，会把控制点也打成不可命中。
 */
export function buildInteractionOverlay(input: InteractionOverlayInput): IUI {
  const layer = new Group()
  const marquee = input.preview.marquee ?? null
  if (marquee !== null) {
    const rect: Rect = marquee
    const element = new LeaferRect({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      fill: MARQUEE_FILL,
      stroke: SELECTION_COLOR,
      strokeWidth: 1 / input.viewportScale,
      hittable: false,
    })
    element.data = { fwSelectionMarquee: true }
    layer.add(element)
  }

  // 悬停描边：1px 淡色（视觉像素，下同）
  if (input.hoverBounds !== null) {
    const { rect } = input.hoverBounds
    const hover = new LeaferRect({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      stroke: HOVER_COLOR,
      strokeWidth: 1 / input.viewportScale,
      hittable: false,
    })
    hover.data = { fwHoverOutline: true }
    layer.add(hover)
  }

  // 选中描边：单选与多选都是整个选中集的联合包围框（多选首版只展示、不给控制点，
  // interaction-spec §3 裁定）；shape 自身不画选中描边（选中视觉统一收在这里，
  // 才能做 1/scale 补偿——scaleFixed 对 strokeWidth 不生效，lessons 踩坑 2）
  const selectionRect = unionRects(input.selectionBounds)
  if (selectionRect !== null) {
    const outline = new LeaferRect({
      x: selectionRect.x,
      y: selectionRect.y,
      width: selectionRect.width,
      height: selectionRect.height,
      stroke: SELECTION_COLOR,
      strokeWidth: SELECTION_WIDTH_CSS_PX / input.viewportScale,
      hittable: false,
    })
    outline.data = {
      fwSelectionOutline: input.selectionBounds.length === 1 ? 'single' : 'group',
    }
    layer.add(outline)
  }

  // 🔴 只给四角控制点，不给边中点（interaction-spec §3：生成结果不允许被自由拉伸变形）；
  // 且仅单选提供控制点（多选首版只展示包围框，见同节 2026-08-04 裁定）
  const single = input.selectionBounds.length === 1 ? input.selectionBounds[0]! : null
  if (single !== null) {
    const handleSize = HANDLE_SIZE_CSS_PX / input.viewportScale
    const strokeWidth = 1 / input.viewportScale
    const { rect } = single
    for (const corner of HANDLE_CORNERS) {
      const cx = corner === 'ne' || corner === 'se' ? rect.x + rect.width : rect.x
      const cy = corner === 'sw' || corner === 'se' ? rect.y + rect.height : rect.y
      const handle = new LeaferRect({
        x: cx - handleSize / 2,
        y: cy - handleSize / 2,
        width: handleSize,
        height: handleSize,
        fill: HANDLE_FILL,
        stroke: SELECTION_COLOR,
        strokeWidth,
      })
      handle.data = { fwResizeHandle: corner, fwId: single.fwId }
      layer.add(handle)
    }
  }
  return layer
}
