import { describe, expect, it } from 'vitest'
import { classifyVideoContinuity } from './video-continuity-result'

describe('视频连续性探针结果分类', () => {
  it('把重挂即时归零与主动 play 后可播区分为两个结论', () => {
    const result = classifyVideoContinuity({
      before: {
        elementId: 1,
        currentTime: 0.3,
        paused: false,
        ended: false,
        readyState: 4,
        totalVideoFrames: 8,
      },
      immediateAfterRemount: {
        elementId: 2,
        currentTime: 0,
        paused: true,
        ended: false,
        readyState: 0,
        totalVideoFrames: 0,
      },
      afterPlayReady: {
        elementId: 2,
        currentTime: 0.01,
        paused: false,
        ended: false,
        readyState: 4,
        totalVideoFrames: 1,
      },
      afterPlaybackProgress: {
        elementId: 2,
        currentTime: 0.04,
        paused: false,
        ended: false,
        readyState: 4,
        totalVideoFrames: 2,
      },
      playError: null,
    })

    expect(result).toEqual({
      elementRecreated: true,
      sessionCurrentTimePreserved: false,
      sessionPausedStatePreserved: false,
      sessionDecodedFrameCounterPreserved: false,
      playCallSucceeded: true,
      mediaBecameReadyAfterPlay: true,
      playbackAdvancedAfterPlay: true,
      decodedFramesAdvancedAfterPlay: true,
      newElementReloadedAndPlayed: true,
    })
  })

  it('play 失败或未进入 ready 时不宣称新元素可重新播放', () => {
    const snapshot = {
      elementId: 1,
      currentTime: 0.3,
      paused: false,
      ended: false,
      readyState: 4,
      totalVideoFrames: 8,
    }
    const immediate = {
      elementId: 2,
      currentTime: 0,
      paused: true,
      ended: false,
      readyState: 0,
      totalVideoFrames: 0,
    }

    expect(classifyVideoContinuity({
      before: snapshot,
      immediateAfterRemount: immediate,
      afterPlayReady: null,
      afterPlaybackProgress: null,
      playError: 'NotSupportedError',
    })).toMatchObject({
      playCallSucceeded: false,
      mediaBecameReadyAfterPlay: false,
      playbackAdvancedAfterPlay: false,
      decodedFramesAdvancedAfterPlay: false,
      newElementReloadedAndPlayed: false,
    })
  })
})
