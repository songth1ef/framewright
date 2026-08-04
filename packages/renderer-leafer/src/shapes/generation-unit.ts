import {
  GEN_UNIT_STYLE,
  NODE_ACTIONS,
  isAiImageNode,
  isAiVideoNode,
  type AiImageNode,
  type AiVideoNode,
  type NodeActionName,
} from '@framewright/core'
import { Box, Rect, Text, type IUI } from 'leafer-ui'
import { toLeaferProps } from '../node-props'
import { applySelection, type ShapeFactory } from './registry'

const S = GEN_UNIT_STYLE

type GenUnitNode = AiImageNode | AiVideoNode

type OnNodeAction = (fwId: string, action: string) => void

/**
 * 内部动作按钮（点击生成 / 重试）：标记 `data.fwInternalAction` 供命中分派排除，
 * 命中时只上报 `onNodeAction` 并 stop 事件——不触发选中、拖拽、双击（M1 §5）。
 * onNodeAction 要等 D0 把 callbacks 加进 RenderContext 后才由 index 注入；
 * 未注入时按钮静默不动作，不许报错。
 */
function wireAction(ui: IUI, fwId: string, action: NodeActionName, onNodeAction?: OnNodeAction): void {
  ui.data = { fwInternalAction: action }
  ui.cursor = 'pointer'
  ui.on('tap', (event: { stop(): void }) => {
    event.stop()
    onNodeAction?.(fwId, action)
  })
}

// ---------------------------------------------------------------------------
// 骨架屏扫光与不定态进度条动画
// 规格允许两侧手段不同（M1 §6）：DOM 侧是 CSS animation，这侧逐帧改 x。
// 渲染器每次 draw() 都重建场景图，动画器不持久持有带：发现带已不在场景里就自行移出。
// ---------------------------------------------------------------------------

interface BandState {
  from: number
  range: number
  /** true = 来回跑（不定态进度条）；false = 单向扫过（骨架扫光） */
  pingPong: boolean
  start: number
  /** 带上过场景后才允许按「离开场景」回收，避免 build 与 add 之间的间隙被误收 */
  attached: boolean
}

const bands = new Map<IUI, BandState>()
let rafId: number | null = null

const raf: ((cb: (now: number) => void) => number) | undefined =
  typeof globalThis.requestAnimationFrame === 'function'
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : undefined

function tick(timestamp: number): void {
  rafId = null
  for (const [band, state] of bands) {
    if (band.leafer != null) {
      state.attached = true
    } else if (state.attached) {
      bands.delete(band)
      continue
    }
    const t = ((timestamp - state.start) % S.skeletonPeriodMs) / S.skeletonPeriodMs
    const p = state.pingPong ? (t < 0.5 ? t * 2 : 2 - t * 2) : t
    band.x = state.from + p * state.range
  }
  if (bands.size > 0 && raf !== undefined) rafId = raf(tick)
}

function animateBand(band: IUI, state: Omit<BandState, 'start' | 'attached'>): void {
  if (raf === undefined) return // 无 RAF 的环境（单测）停在首帧
  bands.set(band, { ...state, attached: band.leafer != null, start: timestamp() })
  if (rafId === null) rafId = raf(tick)
}

function timestamp(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

// ---------------------------------------------------------------------------
// 四态内部结构（M1 §3）。内部坐标一律相对容器左上角；容器尺寸 = node 尺寸。
// ---------------------------------------------------------------------------

function buildEmpty(container: IUI, node: GenUnitNode, onNodeAction?: OnNodeAction): void {
  container.add(new Rect({ x: 0, y: 0, width: node.width, height: node.height, fill: S.emptyBackground }))
  const labelHeight = S.emptyFontSize + 8
  const label = new Text({
    x: 0,
    y: (node.height - labelHeight) / 2,
    width: node.width,
    height: labelHeight,
    text: '点击生成',
    fontSize: S.emptyFontSize,
    fill: S.emptyTextColor,
    textAlign: 'center',
    verticalAlign: 'middle',
  })
  wireAction(label, node.fwId, NODE_ACTIONS.generate, onNodeAction)
  container.add(label)
}

/** pending / running 视觉相同（M1 §3.2）：骨架占满完整尺寸，进度条贴内容区底边。 */
function buildSkeleton(container: IUI, node: GenUnitNode): void {
  const { width, height } = node
  container.add(new Rect({ x: 0, y: 0, width, height, fill: S.skeletonBase }))

  const bandWidth = Math.round(width * 0.4)
  const band = new Rect({ x: -bandWidth, y: 0, width: bandWidth, height, fill: S.skeletonHighlight })
  container.add(band)
  animateBand(band, { from: -bandWidth, range: width + bandWidth, pingPong: false })

  const barY = height - S.progressHeight
  container.add(new Rect({ x: 0, y: barY, width, height: S.progressHeight, fill: S.progressTrackColor }))
  const segWidth = Math.round(width * 0.3)
  const segment = new Rect({ x: 0, y: barY, width: segWidth, height: S.progressHeight, fill: S.progressBarColor })
  container.add(segment)
  animateBand(segment, { from: 0, range: width - segWidth, pingPong: true })
}

function buildSucceeded(container: IUI, node: GenUnitNode): void {
  const contentHeight = node.height - S.footerHeight
  // ai-video 的「首帧」首版用 poster 顶上；可播放播放器是 C3 的范围
  const url = isAiImageNode(node) ? node.src : node.poster
  const mode = node.fit === 'cover' ? 'cover' : node.fit === 'fill' ? 'stretch' : 'fit'
  container.add(
    new Rect({
      x: 0,
      y: 0,
      width: node.width,
      height: contentHeight,
      fill: url !== null && url !== '' ? { type: 'image', url, mode } : S.emptyBackground,
    }),
  )

  container.add(
    new Rect({ x: 0, y: contentHeight, width: node.width, height: S.footerHeight, fill: S.footerBackground }),
  )
  container.add(
    new Text({
      x: S.footerPaddingX,
      y: contentHeight,
      width: node.width - 2 * S.footerPaddingX,
      height: S.footerHeight,
      text: node.prompt,
      fontSize: S.footerFontSize,
      fill: S.footerTextColor,
      textWrap: 'none',
      textOverflow: 'ellipsis',
      verticalAlign: 'middle',
    }),
  )

  // AI生成 徽标（M1 §4）：仅 succeeded，内容区左上角
  const badge = new Box({ x: S.badgeInset, y: S.badgeInset, fill: 'rgba(0,0,0,0.55)', cornerRadius: 4 })
  badge.add(new Text({ text: 'AI生成', fontSize: S.badgeFontSize, fill: '#FFFFFF', padding: [2, 6] }))
  container.add(badge)
}

function buildFailed(container: IUI, node: GenUnitNode, onNodeAction?: OnNodeAction): void {
  container.add(new Rect({ x: 0, y: 0, width: node.width, height: node.height, fill: S.failedBackground }))
  const message = node.errorMessage === null || node.errorMessage === '' ? '生成失败' : node.errorMessage
  const lineHeight = 20
  container.add(
    new Text({
      x: 0,
      y: node.height / 2 - lineHeight,
      width: node.width,
      height: lineHeight,
      text: message,
      fontSize: S.failedFontSize,
      fill: S.failedTextColor,
      textAlign: 'center',
      verticalAlign: 'middle',
      textWrap: 'none',
      textOverflow: 'ellipsis',
    }),
  )
  const retry = new Text({
    x: (node.width - 48) / 2,
    y: node.height / 2 + 2,
    width: 48,
    height: 22,
    text: '重试',
    fontSize: S.failedFontSize,
    fill: S.progressBarColor,
    textAlign: 'center',
    verticalAlign: 'middle',
  })
  wireAction(retry, node.fwId, NODE_ACTIONS.retry, onNodeAction)
  container.add(retry)
}

/**
 * ai-image / ai-video 的四态渲染（C1-leafer）。
 * 一个生成单元 = 一个 Box 容器 + 内部元素；内部元素都不是 node（domain.md §2.2）。
 * 几何、颜色、字号、层次按 M1 实现；布局手段（绝对定位）是本侧自由发挥的部分。
 */
export function createGenerationUnitShape(): ShapeFactory {
  return ({ node, position, selected, onNodeAction }) => {
    if (!isAiImageNode(node) && !isAiVideoNode(node)) {
      throw new Error(`createGenerationUnitShape 只接受 ai-image/ai-video，收到 ${node.fwType}`)
    }
    const container = new Box({
      ...toLeaferProps(node, position),
      cornerRadius: S.cornerRadius,
      overflow: 'hide',
      stroke: node.status === 'failed' ? S.failedBorderColor : S.borderColor,
      strokeWidth: S.borderWidth,
      dashPattern: node.status === 'empty' ? [4, 4] : undefined,
    })
    switch (node.status) {
      case 'empty':
        buildEmpty(container, node, onNodeAction)
        break
      case 'pending':
      case 'running':
        buildSkeleton(container, node)
        break
      case 'succeeded':
        buildSucceeded(container, node)
        break
      case 'failed':
        buildFailed(container, node, onNodeAction)
        break
    }
    return applySelection(container, selected)
  }
}
