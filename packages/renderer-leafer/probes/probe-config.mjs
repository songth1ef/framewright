// 🔴 本文件的数值必须与 DOM 侧 S3 探针逐项一致。
// 上一轮视频基准因 viewport 不一致整轮作废；这些值由单测锁死。
export const LEAFER_SCALE_PROBE_WORKLOAD = Object.freeze({
  renderer: 'Leafer Canvas（生产 LeaferViewportScene + core createScaleFixture）',
  seed: 7,
  scenarios: Object.freeze([
    Object.freeze({
      id: 'many-to-many-1000',
      label: '1000 节点、many-to-many',
      nodeCount: 1000,
      connectionPattern: 'many-to-many',
    }),
    Object.freeze({
      id: 'many-to-many-10000',
      label: '10000 节点、many-to-many',
      nodeCount: 10000,
      connectionPattern: 'many-to-many',
    }),
    Object.freeze({
      id: 'none-10000',
      label: '10000 节点、无连线',
      nodeCount: 10000,
      connectionPattern: 'none',
    }),
  ]),
  sampleWindowMs: 3000,
  viewport: Object.freeze({ width: 1024, height: 1400, viewWidth: 960, viewHeight: 1300 }),
  viewportRole: 'browser viewport 1024×1400；#view 960×1300；与 DOM 侧严格同口径。',
  dragDelta: Object.freeze({ x: 240, y: 120 }),
  zoom: Object.freeze({ startScale: 1, endScale: 1.25 }),
  pan: Object.freeze({ startOffsetX: 0, startOffsetY: 0, endOffsetX: -480, endOffsetY: -650 }),
  longFrameThresholdMs: 50,
})

export const LEAFER_ZOOM_OUT_PROBE_WORKLOAD = Object.freeze({
  renderer: LEAFER_SCALE_PROBE_WORKLOAD.renderer,
  scenarios: Object.freeze([
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
  viewport: LEAFER_SCALE_PROBE_WORKLOAD.viewport,
  viewportRole: LEAFER_SCALE_PROBE_WORKLOAD.viewportRole,
  dragDelta: LEAFER_SCALE_PROBE_WORKLOAD.dragDelta,
  panDelta: Object.freeze({ x: -1200, y: -800 }),
  longFrameThresholdMs: 50,
})
