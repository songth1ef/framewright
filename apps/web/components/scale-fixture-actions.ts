import { createScaleFixture } from '@framewright/core'
import { createCanvasDocument, type DocumentSummary } from './document-list-actions'
import type { ScaleFixtureParams } from './scale-fixture-storage'

/**
 * 大数据量生成入口的逻辑层。
 *
 * 🔴 生成只调 core 的 `createScaleFixture`，本层不另写任何节点构造逻辑——
 * 页面上看到的数据必须和性能基准（probes）里跑的是同一份，数字才和眼睛对得上。
 *
 * 一万节点序列化后约 4.62 MiB、上传约 1 秒（编排方实测），因此整个流程按阶段
 * 回调进度（`onStage`），UI 必须把它展示出来，否则用户会以为页面卡死。
 */

/** 固定 seed：同一组参数每次都生成同一份数据，便于和基准数字对照。 */
export const SCALE_FIXTURE_SEED = 'scale-fixture-ui'

export type ScaleFixtureCreateStage =
  | { kind: 'generating' }
  | { kind: 'uploading'; payloadBytes: number }
  | { kind: 'created'; document: DocumentSummary }

export function scaleFixtureDocumentName(params: ScaleFixtureParams): string {
  return `规模测试（${params.nodeCount} 节点 · ${params.connectionPattern}）`
}

export function formatPayloadSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}

type CreateDocument = typeof createCanvasDocument

export async function createScaleFixtureCanvas(
  params: ScaleFixtureParams,
  onStage: (stage: ScaleFixtureCreateStage) => void,
  create: CreateDocument = createCanvasDocument,
): Promise<DocumentSummary> {
  onStage({ kind: 'generating' })
  const root = createScaleFixture({
    nodeCount: params.nodeCount,
    connectionPattern: params.connectionPattern,
    seed: SCALE_FIXTURE_SEED,
  })

  const name = scaleFixtureDocumentName(params)
  const payloadBytes = new TextEncoder().encode(JSON.stringify({ name, root })).length
  onStage({ kind: 'uploading', payloadBytes })

  const document = await create(name, root)
  onStage({ kind: 'created', document })
  return document
}
