// 🔴 本文件的数值必须与 packages/renderer-dom/probes/probe-config.mjs 逐项一致——
// 上一轮视频基准就是栽在两侧 viewport 不一致（DOM 960x600 vs Leafer 960x1300），
// 对比无效白跑一轮。改这里之前先改对面，或两边一起改。
export const LEAFER_SCALE_PROBE_WORKLOAD = Object.freeze({
  renderer: 'Leafer Canvas（Rect 节点层 + Path 连线层，probe 直绘，不经过生产 shape 工厂——与 DOM 探针绕开生产组件层同口径）',
  scenarios: Object.freeze([
    Object.freeze({ id: 'nodes-100', label: '100 节点、无连线', nodeCount: 100, connectionCount: 0, connectionPattern: 'none' }),
    Object.freeze({ id: 'nodes-1000', label: '1000 节点、无连线', nodeCount: 1000, connectionCount: 0, connectionPattern: 'none' }),
    Object.freeze({ id: 'fanin-100', label: '1000 节点、单节点扇入 100 条连线', nodeCount: 1000, connectionCount: 100, connectionPattern: 'fanin' }),
    Object.freeze({ id: 'distributed-1000', label: '1000 节点、分散 1000 条连线', nodeCount: 1000, connectionCount: 1000, connectionPattern: 'distributed' }),
  ]),
  sampleWindowMs: 3000,
  nodeSize: Object.freeze({ width: 120, height: 80 }),
  viewport: Object.freeze({ width: 1024, height: 1400, viewWidth: 960, viewHeight: 1300 }),
  viewportRole: 'browser viewport 为 1024×1400；其中 #view 是 960×1300 的可见画布裁剪区。所有节点均挂载，仅裁剪区内节点可见；两侧必须使用同一口径。',
  layout: Object.freeze({ columns: 25, originX: 20, originY: 20, gapX: 24, gapY: 24 }),
  dragDelta: Object.freeze({ x: 240, y: 120 }),
  zoom: Object.freeze({ startScale: 1, endScale: 1.25 }),
  longFrameThresholdMs: 50,
})
