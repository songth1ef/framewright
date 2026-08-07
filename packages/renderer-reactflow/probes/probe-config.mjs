export const REACT_FLOW_SCALE_WORKLOAD = Object.freeze({
  renderer: 'React Flow 12.11.2（onlyRenderVisibleElements=true）',
  seed: 7,
  nodeCount: 10000,
  connectionPattern: 'many-to-many',
  scales: Object.freeze([1, 0.5, 0.25, 0.1]),
  miniMapScales: Object.freeze([1, 0.1]),
  sampleWindowMs: 3000,
  dragDelta: Object.freeze({ x: 240, y: 120 }),
  panDelta: Object.freeze({ x: -1200, y: -800 }),
  longFrameThresholdMs: 50,
  viewport: Object.freeze({ width: 1024, height: 1400, viewWidth: 960, viewHeight: 1300 }),
})

/** 与 DOM_ZOOM_OUT_PROBE_WORKLOAD 同结构，用于统一基准 tools/benchmark.mjs。 */
export const REACT_FLOW_ZOOM_OUT_PROBE_WORKLOAD = Object.freeze({
  renderer: REACT_FLOW_SCALE_WORKLOAD.renderer,
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
  viewport: REACT_FLOW_SCALE_WORKLOAD.viewport,
  viewportRole: 'browser viewport 为 1024×1400；其中 #view 是 960×1300 的可见画布裁剪区。React Flow onlyRenderVisibleElements=true 执行节点裁剪；两侧必须使用同一口径。',
  dragDelta: REACT_FLOW_SCALE_WORKLOAD.dragDelta,
  panDelta: REACT_FLOW_SCALE_WORKLOAD.panDelta,
  longFrameThresholdMs: 50,
})

export const REACT_FLOW_VIDEO_WORKLOAD = Object.freeze({
  renderer: 'React Flow 自定义节点内原生 <video>',
  concurrency: Object.freeze([1, 4, 8]),
  sampleWindowMs: 3000,
  longFrameThresholdMs: 50,
  nodeSize: Object.freeze({ width: 460, height: 260 }),
  viewport: Object.freeze({ width: 1024, height: 1400, viewWidth: 960, viewHeight: 1300 }),
})
