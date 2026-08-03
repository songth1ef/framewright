import { SHAPE_TYPES, type FrameNode } from './node-schema'

export type RendererId = 'dom' | 'leafer'

/** 视口属于会话状态：不持久化，但切换渲染器时必须保留。 */
export interface Viewport {
  scale: number
  offsetX: number
  offsetY: number
}

export const DEFAULT_VIEWPORT: Viewport = { scale: 1, offsetX: 0, offsetY: 0 }

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 渲染所需的全部输入。渲染器是这份数据的无状态投影，
 * 销毁重建不丢东西——这正是运行时切换成立的前提。
 * P0 不含交互回调（无交互），P2 交互补齐时扩展。
 */
export interface RenderContext {
  root: FrameNode
  selection: readonly string[]
  viewport: Viewport
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
