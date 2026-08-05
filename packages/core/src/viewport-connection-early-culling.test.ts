import { describe, expect, it } from 'vitest'
import { computeConnectionCurve } from './connection-style'
import { createScaleFixture } from './scale-fixture'
import {
  ConnectionBoundsCache,
  connectionMayIntersectBounds,
  getConnectionBounds,
  getConnectionsInViewport,
} from './viewport-culling'

describe('连线端点保守 AABB 早退', () => {
  it('随机端点对中不会错杀任何精确 AABB 可见的曲线', () => {
    let state = 0x6d2b79f5
    const random = (): number => {
      state = Math.imul(state ^ (state >>> 15), state | 1)
      state ^= state + Math.imul(state ^ (state >>> 7), state | 61)
      return ((state ^ (state >>> 14)) >>> 0) / 4294967296
    }
    const randomBetween = (min: number, max: number): number => min + (max - min) * random()
    let rejectedCount = 0

    for (let index = 0; index < 20_000; index += 1) {
      const from = { x: randomBetween(-5_000, 5_000), y: randomBetween(-5_000, 5_000) }
      const to = { x: randomBetween(-5_000, 5_000), y: randomBetween(-5_000, 5_000) }
      const bounds = {
        x: randomBetween(-2_000, 2_000),
        y: randomBetween(-2_000, 2_000),
        width: randomBetween(0, 2_000),
        height: randomBetween(0, 2_000),
      }
      if (connectionMayIntersectBounds(from.x, from.y, to.x, to.y, bounds)) continue

      rejectedCount += 1
      const exact = getConnectionBounds(computeConnectionCurve(from, to))
      const exactIntersects =
        exact.x <= bounds.x + bounds.width &&
        exact.x + exact.width >= bounds.x &&
        exact.y <= bounds.y + bounds.height &&
        exact.y + exact.height >= bounds.y
      expect(exactIntersects).toBe(false)
    }

    expect(rejectedCount).toBeGreaterThan(1_000)
  })

  it('10000 节点 fanin 在候选物化前丢弃绝大多数视口外连线', () => {
    const root = createScaleFixture({
      nodeCount: 10_000,
      connectionPattern: 'fanin',
      seed: 31,
    })
    const target = root.children.at(-1)
    if (target?.fwType !== 'ai-image' && target?.fwType !== 'ai-video') {
      throw new Error('fanin 夹具末节点必须是生成单元')
    }
    const cache = new ConnectionBoundsCache()
    const connections = getConnectionsInViewport(
      root,
      { scale: 1, offsetX: 0, offsetY: 0 },
      { width: 960, height: 1_300, overscan: 0, maxConnections: 10_000 },
      cache,
    )

    expect(target.sourceFwIds).toHaveLength(9_999)
    expect(connections.length).toBeGreaterThan(0)
    expect(cache.size).toBeGreaterThanOrEqual(connections.length)
    expect(cache.size).toBeLessThan(target.sourceFwIds.length / 50)
  })
})
