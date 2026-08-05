import type { AiImageNode, AiVideoNode, Viewport } from '@framewright/core'
import type { GenerationFormValues } from './generation-flow'

/**
 * G2-4：生成参数面板的纯逻辑层。
 *
 * 面板是挂在生成单元（ai-image / ai-video）节点下方的浮层，含 prompt 输入框、
 * 模型选择、尺寸、（视频节点额外有）时长。本文件只负责面板的两块可测逻辑：
 * 用节点留存的 prompt / params 预填表单（`formValuesFromNode`），以及浮层在
 * 屏幕上的落位计算（`computePanelPlacement`）。
 *
 * 三条硬约束（实现 UI 组件时同样适用）：
 *
 * 1. 🔴 提交按钮 = 用户确认点（`docs/backend-domain.md` §6）：面板改参数
 *    **绝不自动重新生成**；只有用户点「确认生成」才把表单值交给
 *    `generation-flow` 的 runner。本层不持有任何提交入口。
 * 2. 🔴 浮层是 UI 附件不是画布内容（`docs/interaction-spec.md` 附录 B.4）：
 *    锚点跟随视口缩放平移，但 `PANEL_GAP / PANEL_WIDTH / PANEL_HEIGHT` 是
 *    **固定屏幕像素**——不乘 scale、不随节点旋转。
 * 3. 🔴 不遮挡工具栏与其它控件：落位一律钳进画布容器内（见下方教训——
 *    调试面板曾用 `position: fixed` 常驻展开把整个工具栏盖住，而它自己的
 *    单测全绿）。prompt 输入框获得焦点时也不许劫持全局键盘快捷键。
 */

/** 可选模型：与仓内 mock provider 对齐的中立占位名（形状由 provider 决定）。 */
export const MODEL_OPTIONS = ['mock-standard', 'mock-hd'] as const

/** 可选尺寸，首项 = 图片节点默认尺寸。 */
export const SIZE_OPTIONS = ['1024x1024', '576x1024', '1024x576'] as const

/** 可选时长（秒，字符串表单值），首项 = 视频节点默认。 */
export const DURATION_OPTIONS = ['4', '6', '8'] as const

/** 视频节点的默认尺寸（横屏）。 */
export const DEFAULT_VIDEO_SIZE = '1024x576'

/** 面板与节点之间的纵向间距，固定屏幕像素（B.4）。 */
export const PANEL_GAP = 8

/** 面板宽度，固定屏幕像素（B.4）。 */
export const PANEL_WIDTH = 320

/** 面板高度，固定屏幕像素（B.4）。 */
export const PANEL_HEIGHT = 200

type GenerationUnitNode = AiImageNode | AiVideoNode

/**
 * 用节点留存的 prompt / params 预填表单。
 *
 * params 形状由 provider 决定，可能是任何值：类型不对的字段一律当作缺失，
 * 回落到中立默认值。图片节点的表单没有 duration 字段（连 key 都不出现）。
 */
export function formValuesFromNode(node: GenerationUnitNode): GenerationFormValues {
  const { params } = node
  const model = typeof params['model'] === 'string' ? params['model'] : MODEL_OPTIONS[0]
  const defaultSize = node.fwType === 'ai-video' ? DEFAULT_VIDEO_SIZE : SIZE_OPTIONS[0]
  const size = typeof params['size'] === 'string' ? params['size'] : defaultSize
  const values: GenerationFormValues = { prompt: node.prompt, model, size }
  if (node.fwType === 'ai-video') {
    const duration = params['duration']
    values.duration = typeof duration === 'number' ? String(duration) : DURATION_OPTIONS[0]
  }
  return values
}

export interface PanelPlacementInput {
  /** 节点在画布世界坐标系中的位置与尺寸。 */
  nodeX: number
  nodeY: number
  nodeWidth: number
  nodeHeight: number
  /** 画布容器的屏幕像素尺寸。 */
  containerWidth: number
  containerHeight: number
  viewport: Viewport
}

/** 面板相对画布容器的屏幕像素坐标（CSS left / top）。 */
export interface PanelPlacement {
  left: number
  top: number
}

/**
 * 计算面板落位：默认挂在节点正下方、左对齐节点左缘；放不下时翻到节点上方；
 * 上下都放不下则钳进容器，绝不出负坐标；水平方向同理收进容器右缘。
 *
 * 锚点（节点边缘）随 viewport 缩放平移，间距与面板尺寸是固定屏幕像素（B.4）。
 * 所有结果都被限制在容器内部，保证面板不会盖住容器外的工具栏等控件。
 */
export function computePanelPlacement(input: PanelPlacementInput): PanelPlacement {
  const { viewport } = input
  const anchorLeft = input.nodeX * viewport.scale + viewport.offsetX
  const nodeTop = input.nodeY * viewport.scale + viewport.offsetY
  const nodeBottom = (input.nodeY + input.nodeHeight) * viewport.scale + viewport.offsetY

  const left = Math.max(0, Math.min(anchorLeft, input.containerWidth - PANEL_WIDTH))

  // 优先放节点下方；下方放不下就翻到节点上方；再钳进容器（可能上下都放不下）。
  let top = nodeBottom + PANEL_GAP + PANEL_HEIGHT <= input.containerHeight
    ? nodeBottom + PANEL_GAP
    : nodeTop - PANEL_GAP - PANEL_HEIGHT
  top = Math.max(0, Math.min(top, Math.max(0, input.containerHeight - PANEL_HEIGHT)))

  return { left, top }
}
