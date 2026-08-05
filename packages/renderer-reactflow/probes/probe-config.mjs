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

export const REACT_FLOW_VIDEO_WORKLOAD = Object.freeze({
  renderer: 'React Flow 自定义节点内原生 <video>',
  concurrency: Object.freeze([1, 4, 8]),
  sampleWindowMs: 3000,
  longFrameThresholdMs: 50,
  nodeSize: Object.freeze({ width: 460, height: 260 }),
  viewport: Object.freeze({ width: 1024, height: 1400, viewWidth: 960, viewHeight: 1300 }),
})
