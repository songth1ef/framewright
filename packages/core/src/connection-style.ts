import type { Point } from './node-tree'

/**
 * 溯源连线的视觉常量。
 *
 * 单一真相源 —— 两个渲染器都从这里 import，**不许各自硬编码**。
 * 规格见 `docs/connection-spec.md`。
 */
export const CONNECTION_STYLE = {
  strokeColor: '#B8B8C4',
  strokeWidth: 1.5,
  /** 端点小圆点半径；0 表示不画 */
  endpointRadius: 3,
  endpointColor: '#B8B8C4',
  /** 源节点或本节点被选中时，连线高亮 */
  highlightColor: '#5B8091',
  highlightWidth: 2,
} as const

/** 一条连线的三次贝塞尔四点。 */
export interface ConnectionCurve {
  p0: Point
  c1: Point
  c2: Point
  p3: Point
}

/**
 * 由两端锚点算出贝塞尔曲线的四个控制点。
 *
 * 控制点水平外推，外推距离 = 两点水平距离的一半，钳制在 [40, 160]：
 * 近距离时线不会鼓得太夸张，远距离时也不会拉成直线。
 *
 * 🔴 **两侧必须共用本函数**——`k` 决定曲线胖瘦，肉眼可见，各算各的必然分叉。
 */
export function computeConnectionCurve(from: Point, to: Point): ConnectionCurve {
  const k = Math.min(160, Math.max(40, Math.abs(to.x - from.x) * 0.5))
  return {
    p0: { x: from.x, y: from.y },
    c1: { x: from.x + k, y: from.y },
    c2: { x: to.x - k, y: to.y },
    p3: { x: to.x, y: to.y },
  }
}
