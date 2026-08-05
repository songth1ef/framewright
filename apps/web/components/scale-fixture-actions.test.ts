import { describe, expect, it, vi } from 'vitest'
import {
  SCALE_FIXTURE_SEED,
  createScaleFixtureCanvas,
  formatPayloadSize,
  scaleFixtureDocumentName,
  type ScaleFixtureCreateStage,
} from './scale-fixture-actions'
import { isCanvasNode } from './canvas-document-file'
import type { DocumentSummary } from './document-list-actions'

function createdDocument(): DocumentSummary {
  return { id: 'doc-scale', name: '规模测试' }
}

describe('scale fixture actions', () => {
  it('用 core 的 createScaleFixture 生成，节点数与所选一致且通过文档校验', async () => {
    let receivedRoot: unknown
    const create = vi.fn(async (_name: string, root: unknown) => {
      receivedRoot = root
      return createdDocument()
    })

    await createScaleFixtureCanvas(
      { nodeCount: 1000, connectionPattern: 'distributed' },
      () => {},
      create,
    )

    expect(isCanvasNode(receivedRoot)).toBe(true)
    const root = receivedRoot as { fwType: string; children: unknown[] }
    expect(root.fwType).toBe('frame')
    expect(root.children).toHaveLength(1000)
  })

  it('固定 seed：同一参数两次生成的数据完全一致', async () => {
    const roots: unknown[] = []
    const create = vi.fn(async (_name: string, root: unknown) => {
      roots.push(root)
      return createdDocument()
    })
    const params = { nodeCount: 100, connectionPattern: 'many-to-many' } as const

    await createScaleFixtureCanvas(params, () => {}, create)
    await createScaleFixtureCanvas(params, () => {}, create)

    expect(JSON.stringify(roots[0])).toBe(JSON.stringify(roots[1]))
    expect(SCALE_FIXTURE_SEED.length).toBeGreaterThan(0)
  })

  it('按 generating → uploading → created 顺序汇报进度，并给出上传体积', async () => {
    const stages: ScaleFixtureCreateStage[] = []
    const create = vi.fn(async () => createdDocument())

    await createScaleFixtureCanvas(
      { nodeCount: 100, connectionPattern: 'none' },
      (stage) => stages.push(stage),
      create,
    )

    expect(stages.map((stage) => stage.kind)).toEqual(['generating', 'uploading', 'created'])
    const uploading = stages[1]
    expect(uploading?.kind).toBe('uploading')
    if (uploading?.kind === 'uploading') expect(uploading.payloadBytes).toBeGreaterThan(0)
  })

  it('新建画布使用包含节点数与连线形态的名称', async () => {
    const create = vi.fn(async () => createdDocument())

    await createScaleFixtureCanvas(
      { nodeCount: 10000, connectionPattern: 'fanin' },
      () => {},
      create,
    )

    expect(create).toHaveBeenCalledWith('规模测试（10000 节点 · fanin）', expect.anything())
    expect(scaleFixtureDocumentName({ nodeCount: 1000, connectionPattern: 'none' })).toContain('1000')
  })

  it('创建失败时错误透传给调用方', async () => {
    const create = vi.fn(async () => {
      throw new Error('HTTP 500')
    })

    await expect(
      createScaleFixtureCanvas({ nodeCount: 100, connectionPattern: 'none' }, () => {}, create),
    ).rejects.toThrow('HTTP 500')
  })

  it('格式化上传体积', () => {
    expect(formatPayloadSize(512)).toBe('512 B')
    expect(formatPayloadSize(2048)).toBe('2.0 KiB')
    expect(formatPayloadSize(4.62 * 1024 * 1024)).toBe('4.62 MiB')
  })
})
