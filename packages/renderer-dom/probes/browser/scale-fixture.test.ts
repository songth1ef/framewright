import { describe, expect, it } from 'vitest'
import { DOM_SCALE_PROBE_WORKLOAD } from '../probe-config.mjs'
import { buildScaleFixture, countFixtureConnections } from './scale-fixture'

describe('DOM S3 core 规模夹具', () => {
  it('三档都使用 seed=7 的 createScaleFixture 确定性输出', () => {
    for (const scenario of DOM_SCALE_PROBE_WORKLOAD.scenarios) {
      const first = buildScaleFixture(scenario)
      const second = buildScaleFixture(scenario)
      expect(first.children).toHaveLength(scenario.nodeCount)
      expect(second).toEqual(first)
      if (scenario.connectionPattern === 'none') {
        expect(countFixtureConnections(first)).toBe(0)
      } else {
        expect(countFixtureConnections(first)).toBeGreaterThan(0)
      }
    }
  })
})
