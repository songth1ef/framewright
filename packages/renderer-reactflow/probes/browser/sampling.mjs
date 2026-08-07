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

function requireMatchingNode(start, end) {
  if (start.fwId !== end.fwId) throw new Error('拖拽快照的节点不匹配')
}

export function buildDragEvidence(start, end) {
  requireMatchingNode(start, end)
  const delta = { x: end.x - start.x, y: end.y - start.y }
  if (delta.x === 0 && delta.y === 0) {
    throw new Error(`${end.fwId} 采样窗口内节点位置未变化`)
  }
  return {
    fwId: end.fwId,
    start: { x: start.x, y: start.y },
    end: { x: end.x, y: end.y },
    delta,
    positionChanged: true,
  }
}

export function buildPanEvidence(start, end) {
  const delta = { x: end.offsetX - start.offsetX, y: end.offsetY - start.offsetY }
  if (
    !Number.isFinite(start.offsetX) || !Number.isFinite(start.offsetY) ||
    !Number.isFinite(end.offsetX) || !Number.isFinite(end.offsetY) ||
    (delta.x === 0 && delta.y === 0)
  ) {
    throw new Error('采样窗口内 viewport offset 未变化')
  }
  return {
    start: { offsetX: start.offsetX, offsetY: start.offsetY },
    end: { offsetX: end.offsetX, offsetY: end.offsetY },
    delta,
    offsetChanged: true,
  }
}
