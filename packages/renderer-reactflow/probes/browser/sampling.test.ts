import { describe, expect, it } from 'vitest'
import { buildFrameStats, compareMiniMap } from './sampling.mjs'

describe('React Flow 探针采样', () => {
  it('计算帧率与长帧', () => {
    expect(buildFrameStats([16, 17, 60], 50)).toMatchObject({
      frames: 3,
      elapsedMs: 93,
      longFrames: 1,
    })
  })

  it('MiniMap 对照输出耗时与帧率差值', () => {
    expect(compareMiniMap(
      { renderMs: 100, dragFps: 60, panFps: 50 },
      { renderMs: 130, dragFps: 54, panFps: 45 },
    )).toEqual({ renderMsDelta: 30, dragFpsDelta: -6, panFpsDelta: -5 })
  })
})
