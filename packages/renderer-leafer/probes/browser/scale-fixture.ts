import {
  createScaleFixture,
  isAiImageNode,
  isAiVideoNode,
  type FrameNode,
} from '@framewright/core'
import { LEAFER_SCALE_PROBE_WORKLOAD, type LeaferScaleProbeScenario } from '../probe-config.mjs'

/** S3 不复制数据生成规则：页面与测试都从 core 的公开夹具入口走。 */
export function buildScaleFixture(scenario: LeaferScaleProbeScenario): FrameNode {
  return createScaleFixture({
    nodeCount: scenario.nodeCount,
    connectionPattern: scenario.connectionPattern,
    seed: LEAFER_SCALE_PROBE_WORKLOAD.seed,
  })
}

export function countFixtureConnections(root: FrameNode): number {
  return root.children.reduce(
    (total, node) => total +
      (isAiImageNode(node) || isAiVideoNode(node) ? node.sourceFwIds.length : 0),
    0,
  )
}
