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
  renderer: 'DOM（生产 createDomRenderer，React 节点层 + SVG 连线层）',
  scenarios: Object.freeze([
    Object.freeze({ id: 'many-to-many-1000', label: '1000 节点、many-to-many', nodeCount: 1000, connectionPattern: 'many-to-many' }),
    Object.freeze({ id: 'many-to-many-10000', label: '10000 节点、many-to-many', nodeCount: 10000, connectionPattern: 'many-to-many' }),
    Object.freeze({ id: 'none-10000', label: '10000 节点、无连线', nodeCount: 10000, connectionPattern: 'none' }),
  ]),
  seed: 7,
  sampleWindowMs: 3000,
  viewport: Object.freeze({ width: 1024, height: 1400, viewWidth: 960, viewHeight: 1300 }),
  viewportRole: 'browser viewport 为 1024×1400；其中 #view 是 960×1300 的可见画布裁剪区。由生产 renderer 执行视口裁剪；两侧必须使用同一口径。',
  dragDelta: Object.freeze({ x: 240, y: 120 }),
  zoom: Object.freeze({ startScale: 1, endScale: 1.25 }),
  panDelta: Object.freeze({ x: -1200, y: -800 }),
  longFrameThresholdMs: 50,
})

export const DOM_ZOOM_OUT_PROBE_WORKLOAD = Object.freeze({
  renderer: DOM_SCALE_PROBE_WORKLOAD.renderer,
  scenarios: Object.freeze([
    Object.freeze({ id: 'zoom-800', label: '800%', nodeCount: 10000, connectionPattern: 'many-to-many', initialScale: 8 }),
    Object.freeze({ id: 'zoom-100', label: '100%', nodeCount: 10000, connectionPattern: 'many-to-many', initialScale: 1 }),
    Object.freeze({ id: 'zoom-50', label: '50%', nodeCount: 10000, connectionPattern: 'many-to-many', initialScale: 0.5 }),
    Object.freeze({ id: 'zoom-25', label: '25%', nodeCount: 10000, connectionPattern: 'many-to-many', initialScale: 0.25 }),
    Object.freeze({ id: 'zoom-10', label: '10%', nodeCount: 10000, connectionPattern: 'many-to-many', initialScale: 0.1 }),
  ]),
  seed: 7,
  sampleWindowMs: 3000,
  repeatCount: 5,
  repeatCooldownMs: 1000,
  caseTimeoutMs: 120000,
  viewport: DOM_SCALE_PROBE_WORKLOAD.viewport,
  viewportRole: DOM_SCALE_PROBE_WORKLOAD.viewportRole,
  dragDelta: DOM_SCALE_PROBE_WORKLOAD.dragDelta,
  panDelta: DOM_SCALE_PROBE_WORKLOAD.panDelta,
  longFrameThresholdMs: 50,
})
