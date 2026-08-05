function percentile(sorted, value) {
  return sorted[Math.max(0, Math.ceil(sorted.length * value) - 1)]
}

export function buildFrameStats(values, threshold) {
  if (values.length === 0) throw new Error('没有可用帧间隔')
  const sorted = [...values].sort((left, right) => left - right)
  const elapsedMs = values.reduce((total, value) => total + value, 0)
  const middle = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
  return {
    frames: values.length,
    elapsedMs,
    fps: values.length / elapsedMs * 1000,
    frameTimeMs: {
      median,
      p95: percentile(sorted, 0.95),
      max: sorted[sorted.length - 1],
    },
    longFrames: values.filter((value) => value > threshold).length,
  }
}

export function compareMiniMap(withoutMiniMap, withMiniMap) {
  return {
    renderMsDelta: withMiniMap.renderMs - withoutMiniMap.renderMs,
    dragFpsDelta: withMiniMap.dragFps - withoutMiniMap.dragFps,
    panFpsDelta: withMiniMap.panFps - withoutMiniMap.panFps,
  }
}
