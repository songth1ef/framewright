function matchingPair(before, after, index) {
  const start = before[index]
  const end = after[index]
  if (start === undefined || end === undefined || start.fwId !== end.fwId) {
    throw new Error(`播放快照不匹配（index=${index}）`)
  }
  return [start, end]
}

export function assertPlaybackStarted(beforePlay, afterPlay) {
  if (beforePlay.length === 0 || beforePlay.length !== afterPlay.length) {
    throw new Error('播放开始判据收到的快照数量无效')
  }

  for (let index = 0; index < beforePlay.length; index += 1) {
    const [start, end] = matchingPair(beforePlay, afterPlay, index)
    if (
      end.paused ||
      end.currentTime <= start.currentTime ||
      end.totalVideoFrames <= start.totalVideoFrames
    ) {
      throw new Error(`${end.fwId} 尚未开始播放`)
    }
  }
}

export function buildWorkEvidence(sampleStart, sampleEnd) {
  if (sampleStart.length === 0 || sampleStart.length !== sampleEnd.length) {
    throw new Error('采样区间收到的快照数量无效')
  }

  return sampleStart.map((_, index) => {
    const [start, end] = matchingPair(sampleStart, sampleEnd, index)
    if (end.currentTime <= 0 || end.currentTime <= start.currentTime) {
      throw new Error(`${end.fwId} 采样区间内播放进度未增长`)
    }
    if (end.totalVideoFrames <= start.totalVideoFrames) {
      throw new Error(`${end.fwId} 采样区间内解码帧未增长`)
    }

    return {
      fwId: end.fwId,
      progressStartSeconds: start.currentTime,
      progressEndSeconds: end.currentTime,
      progressDeltaSeconds: end.currentTime - start.currentTime,
      progressNonZero: true,
      decodedFramesStart: start.totalVideoFrames,
      decodedFramesEnd: end.totalVideoFrames,
      decodedFramesDelta: end.totalVideoFrames - start.totalVideoFrames,
      decodedFramesIncreased: true,
      droppedFramesStart: start.droppedVideoFrames,
      droppedFramesEnd: end.droppedVideoFrames,
      droppedFramesDelta: end.droppedVideoFrames - start.droppedVideoFrames,
    }
  })
}
