export type ViewportDetailLevel = 'full' | 'simplified' | 'dot'
export type ConnectionDetailLevel = 'curve' | 'line' | 'hidden'

export interface ViewportLod {
  detail: ViewportDetailLevel
  connections: ConnectionDetailLevel
}

/**
 * 按当前缩放给出渲染细节建议。
 *
 * 以常见 120x80 节点反推：50% 时仍有 60x40px，足够完整内容；20% 时仅
 * 24x16px，只值得保留轮廓/色块；低于 20% 时已接近实测 10% 的 12x8px，
 * 节点退化为点，连线不画。简化档连线用直线，避免逐条绘制贝塞尔曲线。
 */
export function getViewportLod(scale: number): ViewportLod {
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('scale 必须是正有限数字')
  if (scale >= 0.5) return { detail: 'full', connections: 'curve' }
  if (scale >= 0.2) return { detail: 'simplified', connections: 'line' }
  return { detail: 'dot', connections: 'hidden' }
}
