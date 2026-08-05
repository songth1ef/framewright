import { SHAPE_TYPES, type FrameNode } from './node-schema'
import type { SelectionMode } from './selection'
import type { ViewportCullingLimits } from './viewport-culling'

export type RendererId = 'dom' | 'leafer'
export type InteractionMode = 'unified' | 'native'
export type ConnectionVisibility = 'visible' | 'hidden'

/** 原生拾取尚未显式启用时，始终走两侧共享的统一交互路径。 */
export const DEFAULT_INTERACTION_MODE: InteractionMode = 'unified'

export function resolveInteractionMode(
  interactionMode: InteractionMode | undefined,
): InteractionMode {
  return interactionMode ?? DEFAULT_INTERACTION_MODE
}

/** 连线默认参与渲染；隐藏必须由用户显式选择。 */
export const DEFAULT_CONNECTION_VISIBILITY: ConnectionVisibility = 'visible'

export function resolveConnectionVisibility(
  connectionVisibility: ConnectionVisibility | undefined,
): ConnectionVisibility {
  return connectionVisibility ?? DEFAULT_CONNECTION_VISIBILITY
}

/** 视口属于会话状态：不持久化，但切换渲染器时必须保留。 */
export interface Viewport {
  scale: number
  offsetX: number
  offsetY: number
}

export const DEFAULT_VIEWPORT: Viewport = { scale: 1, offsetX: 0, offsetY: 0 }

export interface ViewportSize {
  width: number
  height: number
}

/** 未提供尺寸表示 host 尚未完成测量；回退为零尺寸，避免伪造可见区域。 */
export const DEFAULT_VIEWPORT_SIZE: ViewportSize = { width: 0, height: 0 }

export function resolveViewportSize(viewportSize: ViewportSize | undefined): ViewportSize {
  return viewportSize ?? DEFAULT_VIEWPORT_SIZE
}

export interface RendererCallbacks {
  onSelectionRequest(fwIds: readonly string[], mode: SelectionMode): void
  onNodesMove(
    moves: ReadonlyArray<{ fwId: string; parentFwId: string; x: number; y: number }>,
  ): void
  onNodesResize(
    resizes: ReadonlyArray<{
      fwId: string
      parentFwId: string
      x: number
      y: number
      width: number
      height: number
    }>,
  ): void
  onNodesDelete(fwIds: readonly string[]): void
  onViewportChange(viewport: Viewport): void
  onNodeActivate(fwId: string): void
  onNodeAction(fwId: string, action: string): void
}

/** 尚未接入的回调使用稳定空实现，避免渲染器自行持有业务状态。 */
export const NOOP_RENDERER_CALLBACKS: RendererCallbacks = {
  onSelectionRequest: () => undefined,
  onNodesMove: () => undefined,
  onNodesResize: () => undefined,
  onNodesDelete: () => undefined,
  onViewportChange: () => undefined,
  onNodeActivate: () => undefined,
  onNodeAction: () => undefined,
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 渲染所需的全部输入。渲染器是这份数据的无状态投影，
 * 销毁重建不丢东西——这正是运行时切换成立的前提。
 */
export interface RenderContext {
  root: FrameNode
  selection: readonly string[]
  viewport: Viewport
  /** host 测得的容器尺寸；未提供时按 DEFAULT_VIEWPORT_SIZE 处理。 */
  viewportSize?: ViewportSize
  /** 未提供时按 DEFAULT_INTERACTION_MODE 处理，兼容尚未显式选择模式的调用方。 */
  interactionMode?: InteractionMode
  /**
   * 用户各自的观看状态，而非文档数据：不进入 CanvasOp、撤销栈或文档保存。
   * 未提供时按 DEFAULT_CONNECTION_VISIBILITY 处理，兼容既有调用方并默认显示连线。
   */
  connectionVisibility?: ConnectionVisibility
  /** 用户本机的裁剪预算；未提供时由 resolveViewportCullingLimits 解析契约默认值。 */
  cullingLimits?: ViewportCullingLimits
  callbacks: RendererCallbacks
}

export interface RendererAdapter {
  readonly id: RendererId
  readonly displayName: string
  mount(container: HTMLElement, ctx: RenderContext): void
  update(ctx: RenderContext): void
  /** 必须彻底清干净：DOM、监听器、RAF、渲染器实例 */
  destroy(): void
  /**
   * 自证「每个节点被画在了哪」，key 为 fwId，值为画布坐标系下的矩形。
   * 这是对照实验的量具：Leafer 画在 canvas 上没有 DOM 元素可量，
   * 只能由渲染器自报。见 docs/architecture.md §8.1。
   */
  getRenderedBounds(): Map<string, Rect>
  /**
   * 自报「我实际画出来了哪些节点」，用于断言可见性级联。
   * 断言时各自与 core.collectVisibleNodeIds() 的独立计算比对，
   * 不拿两侧自报互相比，避免「两侧一致地错、测试照样绿」。
   */
  getVisibleNodeIds(): readonly string[]
}

/**
 * 注册表完整性校验：把「两版同步开发」从纪律变成机器可检查的约束。
 * 类型系统守编译期，本函数守运行时与动态注册。见 docs/architecture.md §10.3。
 */
export function assertShapeCoverage(
  rendererId: RendererId,
  registry: Record<string, unknown>,
): void {
  const missing = SHAPE_TYPES.filter((type) => registry[type] === undefined)
  if (missing.length > 0) {
    throw new Error(
      `Shape registry incomplete for renderer "${rendererId}": missing ${missing.join(', ')}. ` +
        `Every renderer must cover all SHAPE_TYPES (${SHAPE_TYPES.join(', ')}). ` +
        `If a shape is genuinely unsupported, register an explicit unsupported implementation instead of omitting it.`,
    )
  }
}
