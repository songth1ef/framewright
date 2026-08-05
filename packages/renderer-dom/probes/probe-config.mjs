export const DOM_VIDEO_PROBE_WORKLOAD = Object.freeze({
  renderer: 'DOM 原生 <video controls>',
  concurrency: Object.freeze([1, 4, 8]),
  sampleWindowMs: 3000,
  nodeSize: Object.freeze({ width: 460, height: 260 }),
  viewport: Object.freeze({ width: 1024, height: 1400, viewWidth: 960, viewHeight: 1300 }),
  viewportRole: '同题最坏情况：与 Leafer 探针一致，8 路节点全部位于 view 内',
  audio: '全部 muted；避免多路音频混流混入视频渲染对比',
  longFrameThresholdMs: 50,
})

export const DOM_SCALE_PROBE_WORKLOAD = Object.freeze({
  renderer: 'DOM（React 节点层 + SVG 连线层）',
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
