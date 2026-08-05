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
