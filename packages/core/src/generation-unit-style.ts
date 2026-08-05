/**
 * 生成单元（ai-image / ai-video）的视觉常量。
 *
 * 单一真相源 —— 两个渲染器都从这里 import，**不许各自硬编码**。
 * 规格与每个值的用法见 `docs/generation-unit-spec.md`。
 *
 * 这些值决定的是「长什么样」，不决定「用什么手段」：
 * 内部布局手段（flex/grid vs 绝对定位）两侧各取所长。
 */
export const GEN_UNIT_STYLE = {
  cornerRadius: 8,
  borderWidth: 1,
  borderColor: '#D8D8DE',

  footerHeight: 28,
  footerPaddingX: 10,
  footerFontSize: 12,
  footerTextColor: '#5A5A66',
  footerBackground: '#F7F7F9',

  emptyBackground: '#F2F2F5',
  emptyTextColor: '#8A8A96',
  emptyFontSize: 13,

  skeletonBase: '#E8E8ED',
  skeletonHighlight: '#F4F4F7',
  skeletonPeriodMs: 1400,

  progressTrackColor: '#DCDCE3',
  progressBarColor: '#5B8091',
  progressHeight: 3,

  failedBackground: '#FDF2F2',
  failedBorderColor: '#E4A0A0',
  failedTextColor: '#B04A4A',
  failedFontSize: 12,

  badgeInset: 8,
  badgeFontSize: 11,
} as const

/**
 * 内部动作按钮上报给 `onNodeAction` 的取值。
 *
 * 三个「生成」语义是分开的，不要合并：
 * - `generate`   —— 从空态首次生成
 * - `retry`      —— 失败后重试同一份参数
 * - `regenerate` —— 已成功，再来一次（可能换参数）
 *
 * 🔴 **删除不在这里**。删除走既有的 `onNodesDelete`，不许经 `onNodeAction`。
 * 理由：撤销所需的 `inboundRefs` 对称持有逻辑挂在 `onNodesDelete` 那条路径上
 * （见 `domain.md` §4.5）。开第二条删除路径必然导致「从工具条删」和「按 Delete 删」
 * 的撤销行为不一致 —— 而这类分叉最难被测试发现。
 */
export const NODE_ACTIONS = {
  generate: 'generate',
  retry: 'retry',
  regenerate: 'regenerate',
  download: 'download',
} as const

export type NodeActionName = (typeof NODE_ACTIONS)[keyof typeof NODE_ACTIONS]
