import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAssetStore, type AssetStore } from './asset-store'
import { createTestPrismaClient } from './test-db'

describe('Asset store', () => {
  let prisma: Awaited<ReturnType<typeof createTestPrismaClient>>
  let store: AssetStore

  beforeEach(async () => {
    prisma = await createTestPrismaClient()
    await prisma.project.create({ data: { id: 'proj-a', name: '测试项目' } })
    await prisma.project.create({ data: { id: 'proj-b', name: '另一个项目' } })
    store = createAssetStore(prisma)
  })

  afterEach(async () => {
    await prisma.$disconnect()
  })

  it('createAsset 创建后可由 getAsset 完整读回，不存在的 id 返回 null', async () => {
    const created = await store.createAsset({
      id: 'asset-1',
      projectId: 'proj-a',
      kind: 'image',
      origin: 'upload',
      storageKey: 'proj-a/asset-1.png',
      mimeType: 'image/png',
      byteSize: 1234,
      width: 1024,
      height: 1024,
    })

    expect(created).toMatchObject({
      id: 'asset-1',
      projectId: 'proj-a',
      kind: 'image',
      origin: 'upload',
      storageKey: 'proj-a/asset-1.png',
      mimeType: 'image/png',
      byteSize: 1234,
      width: 1024,
      height: 1024,
      durationMs: null,
      generationId: null,
    })
    expect(created.createdAt).toBeInstanceOf(Date)
    await expect(store.getAsset('asset-1')).resolves.toEqual(created)
    await expect(store.getAsset('missing')).resolves.toBeNull()
  })

  it('生成素材指回生成任务：generationId 落库，可按 generationId 反查', async () => {
    await store.createAsset({
      id: 'asset-1',
      projectId: 'proj-a',
      kind: 'video',
      origin: 'generated',
      storageKey: 'proj-a/asset-1.mp4',
      mimeType: 'video/mp4',
      byteSize: 999,
      width: 1024,
      height: 576,
      durationMs: 5000,
      generationId: 'gen-1',
    })
    await store.createAsset({
      id: 'asset-2',
      projectId: 'proj-a',
      kind: 'image',
      origin: 'generated',
      storageKey: 'proj-a/asset-2.png',
      mimeType: 'image/png',
      byteSize: 1,
      generationId: 'gen-1',
    })
    await store.createAsset({
      id: 'asset-3',
      projectId: 'proj-a',
      kind: 'image',
      origin: 'upload',
      storageKey: 'proj-a/asset-3.png',
      mimeType: 'image/png',
      byteSize: 1,
    })

    const ofGen1 = await store.listGenerationAssets('gen-1')
    expect(ofGen1.map(({ id }) => id).sort()).toEqual(['asset-1', 'asset-2'])
    await expect(store.listGenerationAssets('gen-none')).resolves.toEqual([])
  })

  it('listProjectAssets 只列本项目素材，最近创建的在前', async () => {
    await store.createAsset({
      id: 'asset-1', projectId: 'proj-a', kind: 'image', origin: 'upload',
      storageKey: 'k1', mimeType: 'image/png', byteSize: 1,
    })
    await store.createAsset({
      id: 'asset-2', projectId: 'proj-a', kind: 'image', origin: 'upload',
      storageKey: 'k2', mimeType: 'image/png', byteSize: 1,
    })
    await store.createAsset({
      id: 'asset-3', projectId: 'proj-b', kind: 'image', origin: 'upload',
      storageKey: 'k3', mimeType: 'image/png', byteSize: 1,
    })

    const assets = await store.listProjectAssets('proj-a')
    expect(assets.map(({ id }) => id)).toEqual(['asset-2', 'asset-1'])
  })

  it('deleteAsset 删除记录；不存在的 id 抛 P2025', async () => {
    await store.createAsset({
      id: 'asset-1', projectId: 'proj-a', kind: 'image', origin: 'upload',
      storageKey: 'k1', mimeType: 'image/png', byteSize: 1,
    })

    await store.deleteAsset('asset-1')

    await expect(store.getAsset('asset-1')).resolves.toBeNull()
    await expect(store.deleteAsset('asset-1')).rejects.toMatchObject({ code: 'P2025' })
  })

  it('删项目级联删素材记录（外键语义兜底）', async () => {
    await store.createAsset({
      id: 'asset-1', projectId: 'proj-a', kind: 'image', origin: 'upload',
      storageKey: 'k1', mimeType: 'image/png', byteSize: 1,
    })

    await prisma.project.delete({ where: { id: 'proj-a' } })

    await expect(store.getAsset('asset-1')).resolves.toBeNull()
  })
})
