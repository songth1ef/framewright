import type { Rect } from '@framewright/core'
import { Group, Rect as LeaferRect, type IUI } from 'leafer-ui'
import type { CanvasInteractionPreview } from './canvas-interaction'

const SELECTION_COLOR = '#5B8091'
const MARQUEE_FILL = 'rgba(91, 128, 145, 0.15)'

export interface InteractionOverlayInput {
  preview: CanvasInteractionPreview
  viewportScale: number
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
  return layer
}
