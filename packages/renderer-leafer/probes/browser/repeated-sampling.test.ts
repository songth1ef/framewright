import { describe, expect, it } from 'vitest'
import { aggregateSamples, summarizeValues } from './repeated-sampling.mjs'

function sample(firstScreenMs: number, dragFps: number, panFps: number) {
  return {
    status: 'completed',
    firstScreen: { elapsedMs: firstScreenMs },
    drag: {
      avgFps: dragFps,
      frameTimeMs: { median: 10, p95: 20, max: 30 },
      longFrames: 1,
    },
    pan: {
      avgFps: panFps,
      frameTimeMs: { median: 15, p95: 25, max: 35 },
      longFrames: 2,
    },
  }
}

describe('S4 重复采样聚合', () => {
  it('计算奇数与偶数样本的中位数', () => {
    expect(summarizeValues([9, 1, 5])).toMatchObject({ median: 5 })
    expect(summarizeValues([9, 1, 5, 3])).toMatchObject({ median: 4 })
  })

  it('使用上下半区中位数计算四分位距', () => {
    expect(summarizeValues([1, 2, 3, 4, 5, 6, 7, 8])).toEqual({
      median: 4.5,
      q1: 2.5,
      q3: 6.5,
      iqr: 4,
    })
  })

  it('聚合时仍逐次保留包含离群值的原始样本', () => {
    const samples = [sample(10, 60, 50), sample(11, 59, 49), sample(500, 1, 1)]
    const result = aggregateSamples(samples)

    expect(result.samples).toBe(samples)
    expect(result.samples[2]?.firstScreen.elapsedMs).toBe(500)
    expect(result.aggregate.firstScreen.elapsedMs.median).toBe(11)
    expect(result.aggregate.drag.avgFps.median).toBe(59)
  })
})
