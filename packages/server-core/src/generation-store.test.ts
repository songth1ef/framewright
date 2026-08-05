import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGenerationStore, type GenerationStore } from './generation-store'
import { createTestPrismaClient } from './test-db'

describe('Generation store', () => {
  let prisma: Awaited<ReturnType<typeof createTestPrismaClient>>
  let store: GenerationStore

  beforeEach(async () => {
    prisma = await createTestPrismaClient()
    store = createGenerationStore(prisma)
  })

  afterEach(async () => {
    await prisma.$disconnect()
  })

  it('createGeneration 默认 pending，数组字段为空，finishedAt 为 null；getGeneration 完整读回', async () => {
    const created = await store.createGeneration({
      id: 'gen-1',
      projectId: 'proj-a',
      documentId: 'doc-a',
      sessionId: 'sess-a',
      messageId: 'msg-a',
      kind: 'text-to-image',
      params: { kind: 'text-to-image', prompt: '一只猫', options: { size: '1K' } },
      inputAssetIds: ['asset-in-1'],
    })

    expect(created).toMatchObject({
      id: 'gen-1',
      projectId: 'proj-a',
      documentId: 'doc-a',
      sessionId: 'sess-a',
      messageId: 'msg-a',
      status: 'pending',
      kind: 'text-to-image',
      params: { kind: 'text-to-image', prompt: '一只猫', options: { size: '1K' } },
      inputAssetIds: ['asset-in-1'],
      outputAssetIds: [],
      errorMessage: null,
      finishedAt: null,
    })
    expect(created.createdAt).toBeInstanceOf(Date)
    await expect(store.getGeneration('gen-1')).resolves.toEqual(created)
    await expect(store.getGeneration('missing')).resolves.toBeNull()
  })

  it('sessionId/messageId 可空（直接点节点上的「生成」场景）', async () => {
    const created = await store.createGeneration({
      projectId: 'proj-a',
      documentId: 'doc-a',
      kind: 'text-to-video',
      params: { kind: 'text-to-video', prompt: '海浪' },
    })

    expect(created.sessionId).toBeNull()
    expect(created.messageId).toBeNull()
    expect(created.inputAssetIds).toEqual([])
  })

  it('updateGenerationStatus 推进到 running 时不写 finishedAt', async () => {
    await store.createGeneration({
      id: 'gen-1', projectId: 'proj-a', documentId: 'doc-a',
      kind: 'text-to-image', params: { prompt: 'x' },
    })

    const running = await store.updateGenerationStatus('gen-1', 'running')

    expect(running.status).toBe('running')
    expect(running.finishedAt).toBeNull()
  })

  it('推进到 succeeded：写 outputAssetIds 并自动落 finishedAt', async () => {
    await store.createGeneration({
      id: 'gen-1', projectId: 'proj-a', documentId: 'doc-a',
      kind: 'text-to-image', params: { prompt: 'x' },
    })

    const succeeded = await store.updateGenerationStatus('gen-1', 'succeeded', {
      outputAssetIds: ['asset-1', 'asset-2'],
    })

    expect(succeeded.status).toBe('succeeded')
    expect(succeeded.outputAssetIds).toEqual(['asset-1', 'asset-2'])
    expect(succeeded.finishedAt).toBeInstanceOf(Date)
  })

  it('推进到 failed：写 errorMessage 并自动落 finishedAt', async () => {
    await store.createGeneration({
      id: 'gen-1', projectId: 'proj-a', documentId: 'doc-a',
      kind: 'text-to-image', params: { prompt: 'x' },
    })

    const failed = await store.updateGenerationStatus('gen-1', 'failed', {
      errorMessage: '内容审核未通过',
    })

    expect(failed.status).toBe('failed')
    expect(failed.errorMessage).toBe('内容审核未通过')
    expect(failed.finishedAt).toBeInstanceOf(Date)
  })

  it('updateGenerationStatus 对不存在的 id 抛 P2025', async () => {
    await expect(store.updateGenerationStatus('missing', 'running')).rejects.toMatchObject({
      code: 'P2025',
    })
  })
})
