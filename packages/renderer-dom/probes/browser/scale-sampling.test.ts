import { describe, expect, it } from 'vitest'
import {
  DOM_SCALE_PROBE_WORKLOAD,
  DOM_ZOOM_OUT_PROBE_WORKLOAD,
} from '../probe-config.mjs'
import {
  buildDragEvidence,
  buildFrameStats,
  buildPanEvidence,
  measureConnectionLayer,
  selectMountedLeafId,
  buildZoomEvidence,
} from './scale-sampling.mjs'

describe('DOM 规模 probe', () => {
  it('按连线层的全部直接子图元计数，并区分层缺失与真实空层', () => {
    expect(measureConnectionLayer({
      children: [
        { tagName: 'path' },
        { tagName: 'LINE' },
        { tagName: 'line' },
      ],
    })).toEqual({
      connectionLayerPresent: true,
      mountedConnectionCount: 3,
      mountedConnectionElementTypes: { line: 2, path: 1 },
    })
    expect(measureConnectionLayer({ children: [] })).toEqual({
      connectionLayerPresent: true,
      mountedConnectionCount: 0,
      mountedConnectionElementTypes: {},
    })
    expect(measureConnectionLayer(null)).toEqual({
      connectionLayerPresent: false,
      mountedConnectionCount: 0,
      mountedConnectionElementTypes: {},
    })
    expect(measureConnectionLayer({
      children: [{ tagName: 'g' }, { tagName: 'g' }],
      querySelectorAll: () => [
        { getAttribute: () => '608' },
        { getAttribute: () => '392' },
      ],
    })).toEqual({
      connectionLayerPresent: true,
      mountedConnectionCount: 1_000,
      mountedConnectionElementTypes: { g: 2 },
    })
  })

  it('从实际挂载集合选择叶子，不依赖 fixture 的第一个节点', () => {
    expect(selectMountedLeafId(['root', 'scale-node-417', 'scale-node-9'], 'root'))
      .toBe('scale-node-417')
    expect(() => selectMountedLeafId(['root'], 'root')).toThrow('没有实际挂载的叶子节点')
  })

  it('固定两侧共用的工作负载参数与 S3 场景矩阵', () => {
    expect(DOM_SCALE_PROBE_WORKLOAD).toMatchObject({
      sampleWindowMs: 3000,
      longFrameThresholdMs: 50,
      seed: 7,
      panDelta: { x: -1200, y: -800 },
      viewport: { width: 1024, height: 1400, viewWidth: 960, viewHeight: 1300 },
      scenarios: [
        { id: 'many-to-many-1000', nodeCount: 1000, connectionPattern: 'many-to-many' },
        { id: 'many-to-many-10000', nodeCount: 10000, connectionPattern: 'many-to-many' },
        { id: 'none-10000', nodeCount: 10000, connectionPattern: 'none' },
      ],
    })
  })

  it('S4 四档只改变初始缩放，全部使用 10000 节点 many-to-many', () => {
    expect(DOM_ZOOM_OUT_PROBE_WORKLOAD).toMatchObject({
      seed: 7,
      sampleWindowMs: 3000,
      caseTimeoutMs: 120000,
      longFrameThresholdMs: 50,
      viewport: { width: 1024, height: 1400, viewWidth: 960, viewHeight: 1300 },
      dragDelta: { x: 240, y: 120 },
      panDelta: { x: -1200, y: -800 },
    })
    expect(DOM_ZOOM_OUT_PROBE_WORKLOAD.scenarios).toEqual([
      { id: 'zoom-800', label: '800%', nodeCount: 10000, connectionPattern: 'many-to-many', initialScale: 8 },
      { id: 'zoom-100', label: '100%', nodeCount: 10000, connectionPattern: 'many-to-many', initialScale: 1 },
      { id: 'zoom-50', label: '50%', nodeCount: 10000, connectionPattern: 'many-to-many', initialScale: 0.5 },
      { id: 'zoom-25', label: '25%', nodeCount: 10000, connectionPattern: 'many-to-many', initialScale: 0.25 },
      { id: 'zoom-10', label: '10%', nodeCount: 10000, connectionPattern: 'many-to-many', initialScale: 0.1 },
    ])
  })

  it('平移证据记录 offset 起止值并拒绝空转', () => {
    expect(buildPanEvidence(
      { offsetX: 0, offsetY: 0 },
      { offsetX: -1200, offsetY: -800 },
    )).toMatchObject({ delta: { x: -1200, y: -800 }, offsetChanged: true })
    expect(() => buildPanEvidence(
      { offsetX: 0, offsetY: 0 },
      { offsetX: 0, offsetY: 0 },
    )).toThrow('viewport offset 未变化')
  })

  it('报告平均 fps、中位数、p95、最大帧时与长帧数', () => {
    expect(buildFrameStats([10, 20, 30, 60], 50)).toEqual({
      frames: 4,
      elapsedMs: 120,
      fps: 1000 / 30,
      frameTimeMs: { median: 25, p95: 60, max: 60 },
      longFrames: 1,
    })
    expect(() => buildFrameStats([], 50)).toThrow('没有可用帧间隔')
  })

  it('拖拽证据记录节点起止坐标并拒绝空转', () => {
    expect(buildDragEvidence(
      { fwId: 'box-0', x: 20, y: 20 },
      { fwId: 'box-0', x: 260, y: 140 },
    )).toEqual({
      fwId: 'box-0',
      start: { x: 20, y: 20 },
      end: { x: 260, y: 140 },
      delta: { x: 240, y: 120 },
      positionChanged: true,
    })

    expect(() => buildDragEvidence(
      { fwId: 'box-0', x: 20, y: 20 },
      { fwId: 'box-0', x: 20, y: 20 },
    )).toThrow('采样窗口内节点位置未变化')
  })

  it('缩放证据记录 scale 起止值并拒绝空转', () => {
    expect(buildZoomEvidence({ scale: 1 }, { scale: 1.25 })).toEqual({
      scaleStart: 1,
      scaleEnd: 1.25,
      scaleDelta: 0.25,
      scaleChanged: true,
    })

    expect(() => buildZoomEvidence({ scale: 1 }, { scale: 1 })).toThrow(
      '采样窗口内 scale 未变化',
    )
  })
})
