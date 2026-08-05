import { describe, expect, it } from 'vitest'
import { assertPlaybackStarted, buildWorkEvidence, type PlaybackSnapshot } from './sampling.mjs'

function snapshot(currentTime: number, totalVideoFrames: number): PlaybackSnapshot {
  return {
    fwId: 'probe-video-0',
    currentTime,
    totalVideoFrames,
    droppedVideoFrames: 0,
    readyState: 4,
    paused: false,
  }
}

describe('视频 probe 采样窗口', () => {
  it('拒绝在播放真正开始之前开窗', () => {
    expect(() => assertPlaybackStarted([snapshot(0, 0)], [snapshot(0, 0)])).toThrow(
      'probe-video-0 尚未开始播放',
    )
  })

  it('要求采样区间内每一路的进度与解码帧都继续增长', () => {
    const evidence = buildWorkEvidence(
      [snapshot(0.2, 4)],
      [snapshot(3.2, 94)],
    )

    expect(evidence).toEqual([
      expect.objectContaining({
        fwId: 'probe-video-0',
        progressDeltaSeconds: 3,
        decodedFramesDelta: 90,
        progressNonZero: true,
        decodedFramesIncreased: true,
      }),
    ])
  })

  it('拒绝只有 rAF 在走、视频解码没有工作的空转结果', () => {
    expect(() => buildWorkEvidence([snapshot(0.2, 4)], [snapshot(3.2, 4)])).toThrow(
      'probe-video-0 采样区间内解码帧未增长',
    )
  })
})
