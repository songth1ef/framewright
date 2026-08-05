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
