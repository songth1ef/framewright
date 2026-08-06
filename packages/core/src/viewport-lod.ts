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
/** 与 PERFORMANCE_PRESETS.balanced 一致；不传阈值时行为与配置系统落地前完全相同。 */
export const DEFAULT_LOD_THRESHOLDS: LodThresholds = {
  fullDetailScale: 0.5,
  simplifiedDetailScale: 0.2,
}

export interface LodThresholds {
  fullDetailScale: number
  simplifiedDetailScale: number
}

/**
 * 阈值改为可配置：用户反馈「缩小后所有卡片变成纯色方块，认不出是什么」——
 * 那正是 scale 落进 dot 档的表现。降级点该由用户按自己机器和用途定，
 * 而不是全世界共用两个写死的数字。
 *
 * ⚠️ 阈值只传一半时用默认值补齐，但**不做「简化档必须低于完整档」的兜底纠正**：
 * 那种自相矛盾的组合应当在写入配置时就被 isPerformanceProfile 拒掉，
 * 在渲染热路径上偷偷纠正只会掩盖配置错误。
 */
export function getViewportLod(scale: number, thresholds: Partial<LodThresholds> = {}): ViewportLod {
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('scale 必须是正有限数字')
  const full = thresholds.fullDetailScale ?? DEFAULT_LOD_THRESHOLDS.fullDetailScale
  const simplified = thresholds.simplifiedDetailScale ?? DEFAULT_LOD_THRESHOLDS.simplifiedDetailScale
  if (scale >= full) return { detail: 'full', connections: 'curve' }
  if (scale >= simplified) return { detail: 'simplified', connections: 'line' }
  return { detail: 'dot', connections: 'hidden' }
}
