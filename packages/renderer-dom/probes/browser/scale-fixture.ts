import {
  CORS_SAFE_PROBE_MEDIA_ASSETS,
  createScaleFixture,
  isAiImageNode,
  isAiVideoNode,
  type FrameNode,
} from '@framewright/core'
import { DOM_SCALE_PROBE_WORKLOAD, type DomScaleProbeScenario } from '../probe-config.mjs'

/** S3 页面与测试统一从 core 构造场景，禁止 probe 自建平行数据生成器。 */
export function buildScaleFixture(scenario: DomScaleProbeScenario): FrameNode {
  return createScaleFixture({
    nodeCount: scenario.nodeCount,
    connectionPattern: scenario.connectionPattern,
    seed: DOM_SCALE_PROBE_WORKLOAD.seed,
    mediaAssets: CORS_SAFE_PROBE_MEDIA_ASSETS,
  })
}

export function countFixtureConnections(root: FrameNode): number {
  return root.children.reduce(
    (total, node) => total +
      (isAiImageNode(node) || isAiVideoNode(node) ? node.sourceFwIds.length : 0),
    0,
  )
}
