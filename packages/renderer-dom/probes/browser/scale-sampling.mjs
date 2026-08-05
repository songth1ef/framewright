function percentileNearestRank(sorted, percentile) {
  return sorted[Math.max(0, Math.ceil(sorted.length * percentile) - 1)]
}

export function buildFrameStats(frameDurationsMs, longFrameThresholdMs) {
  if (frameDurationsMs.length === 0) throw new Error('没有可用帧间隔')
  if (frameDurationsMs.some((duration) => !Number.isFinite(duration) || duration < 0)) {
    throw new Error('帧耗时必须是非负有限数')
  }
  const sorted = [...frameDurationsMs].sort((left, right) => left - right)
  const elapsedMs = frameDurationsMs.reduce((total, value) => total + value, 0)
  const middle = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
  return {
    frames: frameDurationsMs.length,
    elapsedMs,
    fps: (frameDurationsMs.length / elapsedMs) * 1000,
    frameTimeMs: {
      median,
      p95: percentileNearestRank(sorted, 0.95),
      max: sorted[sorted.length - 1],
    },
    longFrames: frameDurationsMs.filter((value) => value > longFrameThresholdMs).length,
  }
}

function requireMatchingNode(start, end) {
  if (start.fwId !== end.fwId) throw new Error('拖拽快照的节点不匹配')
}

export function selectMountedLeafId(mountedIds, rootFwId) {
  const fwId = mountedIds.find((candidate) => candidate !== rootFwId)
  if (fwId === undefined) throw new Error('没有实际挂载的叶子节点')
  return fwId
}

export function measureConnectionLayer(layer) {
  if (layer === null) {
    return {
      connectionLayerPresent: false,
      mountedConnectionCount: 0,
      mountedConnectionElementTypes: {},
    }
  }
  const mountedConnectionElementTypes = {}
  for (const child of layer.children) {
    const elementType = child.tagName.toLowerCase()
    mountedConnectionElementTypes[elementType] =
      (mountedConnectionElementTypes[elementType] ?? 0) + 1
  }
  return {
    connectionLayerPresent: true,
    mountedConnectionCount: layer.children.length,
    mountedConnectionElementTypes,
  }
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

export function buildZoomEvidence(start, end) {
  const scaleDelta = end.scale - start.scale
  if (!Number.isFinite(start.scale) || !Number.isFinite(end.scale) || scaleDelta === 0) {
    throw new Error('采样窗口内 scale 未变化')
  }
  return {
    scaleStart: start.scale,
    scaleEnd: end.scale,
    scaleDelta,
    scaleChanged: true,
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
