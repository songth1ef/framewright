import { describe, expect, it } from 'vitest'
import { LEAFER_SCALE_PROBE_WORKLOAD } from '../probe-config.mjs'
import { buildDragEvidence, buildZoomEvidence } from './scale-sampling.mjs'

describe('Leafer 规模 probe', () => {
  it('固定与 DOM 侧逐项一致的工作负载参数与 S1/S2 场景矩阵', () => {
    // 🔴 两侧口径锁：上一轮视频基准因 viewport 不一致整轮作废，本用例就是防复发闸门
    expect(LEAFER_SCALE_PROBE_WORKLOAD).toMatchObject({
      sampleWindowMs: 3000,
      longFrameThresholdMs: 50,
      nodeSize: { width: 120, height: 80 },
      viewport: { width: 1024, height: 1400, viewWidth: 960, viewHeight: 1300 },
      layout: { columns: 25, originX: 20, originY: 20, gapX: 24, gapY: 24 },
      dragDelta: { x: 240, y: 120 },
      zoom: { startScale: 1, endScale: 1.25 },
      scenarios: [
        { id: 'nodes-100', nodeCount: 100, connectionCount: 0, connectionPattern: 'none' },
        { id: 'nodes-1000', nodeCount: 1000, connectionCount: 0, connectionPattern: 'none' },
        { id: 'fanin-100', nodeCount: 1000, connectionCount: 100, connectionPattern: 'fanin' },
        { id: 'distributed-1000', nodeCount: 1000, connectionCount: 1000, connectionPattern: 'distributed' },
      ],
    })
    expect(LEAFER_SCALE_PROBE_WORKLOAD.viewportRole).toContain('两侧必须使用同一口径')
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
