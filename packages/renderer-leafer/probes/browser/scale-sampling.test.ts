import { describe, expect, it } from 'vitest'
import { LEAFER_SCALE_PROBE_WORKLOAD } from '../probe-config.mjs'
import {
  buildDragEvidence,
  buildPanEvidence,
  buildZoomEvidence,
  buildFrameStats,
} from './scale-sampling.mjs'
import { buildScaleFixture, countFixtureConnections } from './scale-fixture'

describe('Leafer S3 规模 probe', () => {
  it('锁死与 DOM 侧相同的 S3 场景与采样口径', () => {
    expect(LEAFER_SCALE_PROBE_WORKLOAD).toMatchObject({
      seed: 7,
      sampleWindowMs: 3000,
      longFrameThresholdMs: 50,
      viewport: { width: 1024, height: 1400, viewWidth: 960, viewHeight: 1300 },
      scenarios: [
        { nodeCount: 1000, connectionPattern: 'many-to-many' },
        { nodeCount: 10000, connectionPattern: 'many-to-many' },
        { nodeCount: 10000, connectionPattern: 'none' },
      ],
    })
    expect(LEAFER_SCALE_PROBE_WORKLOAD.viewportRole).toContain('与 DOM 侧严格同口径')
  })

  it('报告平均 fps、中位数、p95、最大值与长帧数', () => {
    expect(buildFrameStats([10, 20, 30, 80], 50)).toEqual({
      frames: 4,
      elapsedMs: 140,
      fps: 4000 / 140,
      frameTimeMs: { median: 25, p95: 80, max: 80 },
      longFrames: 1,
    })
    expect(() => buildFrameStats([], 50)).toThrow('没有可用帧间隔')
  })

  it('场景数据直接来自 core createScaleFixture(seed=7)', () => {
    const many = buildScaleFixture({
      id: 'test-many',
      label: 'test',
      nodeCount: 1000,
      connectionPattern: 'many-to-many',
    })
    const none = buildScaleFixture({
      id: 'test-none',
      label: 'test',
      nodeCount: 10000,
      connectionPattern: 'none',
    })

    expect(many.children).toHaveLength(1000)
    expect(many.children[0]?.fwId).toBe('scale-node-0')
    expect(countFixtureConnections(many)).toBe(1776)
    expect(none.children).toHaveLength(10000)
    expect(countFixtureConnections(none)).toBe(0)
  })

  it('拖拽、缩放和平移证据都拒绝空转', () => {
    expect(buildDragEvidence(
      { fwId: 'scale-node-0', x: 40, y: 40 },
      { fwId: 'scale-node-0', x: 280, y: 160 },
    )).toMatchObject({ positionChanged: true, delta: { x: 240, y: 120 } })
    expect(buildZoomEvidence({ scale: 1 }, { scale: 1.25 })).toMatchObject({
      scaleChanged: true,
      scaleDelta: 0.25,
    })
    expect(buildPanEvidence(
      { offsetX: 0, offsetY: 0 },
      { offsetX: -480, offsetY: -650 },
    )).toMatchObject({ offsetChanged: true, delta: { x: -480, y: -650 } })

    expect(() => buildDragEvidence(
      { fwId: 'scale-node-0', x: 40, y: 40 },
      { fwId: 'scale-node-0', x: 40, y: 40 },
    )).toThrow('节点位置未变化')
    expect(() => buildZoomEvidence({ scale: 1 }, { scale: 1 })).toThrow('scale 未变化')
    expect(() => buildPanEvidence(
      { offsetX: 0, offsetY: 0 },
      { offsetX: 0, offsetY: 0 },
    )).toThrow('viewport offset 未变化')
  })
})
