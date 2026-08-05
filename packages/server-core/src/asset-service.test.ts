import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAssetService } from './asset-service'
import { createLocalAssetStorage } from './asset-storage'
import type { AssetStore, CreateAssetInput, StoredAsset } from './asset-store'

function createMemoryAssetStore(): AssetStore {
  const assets = new Map<string, StoredAsset>()
  return {
    async createAsset(input: CreateAssetInput) {
      const asset: StoredAsset = {
        id: input.id ?? 'generated-id',
        projectId: input.projectId,
        kind: input.kind,
        origin: input.origin,
        storageKey: input.storageKey,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        width: input.width ?? null,
        height: input.height ?? null,
        durationMs: input.durationMs ?? null,
        generationId: input.generationId ?? null,
        createdAt: new Date('2026-08-04T00:00:00.000Z'),
      }
      assets.set(asset.id, asset)
      return asset
    },
    async getAsset(assetId) { return assets.get(assetId) ?? null },
    async listProjectAssets(projectId) {
      return [...assets.values()].filter((asset) => asset.projectId === projectId)
    },
    async listGenerationAssets(generationId) {
      return [...assets.values()].filter((asset) => asset.generationId === generationId)
    },
    async deleteAsset(assetId) {
      if (!assets.delete(assetId)) throw { code: 'P2025' }
    },
  }
}

describe('AssetService', () => {
  let rootDir: string

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'fw-asset-service-'))
  })

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true })
  })

  it('上传素材时写本地存储并创建 upload Asset，随后可按 id 读取原始字节', async () => {
    const assetStore = createMemoryAssetStore()
    const service = createAssetService({
      assetStore,
      storage: createLocalAssetStorage({ rootDir }),
      idFactory: () => 'asset-1',
    })
    const data = new Uint8Array([1, 2, 3, 250])

    const asset = await service.uploadAsset({
      projectId: 'project-a',
      kind: 'image',
      data,
      mimeType: 'image/png',
      width: 640,
      height: 360,
    })

    expect(asset).toMatchObject({
      id: 'asset-1',
      projectId: 'project-a',
      origin: 'upload',
      storageKey: 'project-a/asset-1.png',
      byteSize: 4,
    })
    await expect(service.getAssetContent('asset-1')).resolves.toMatchObject({ asset, data })
  })

  it('删除素材时同时删除文件与记录；不存在返回 false', async () => {
    const service = createAssetService({
      assetStore: createMemoryAssetStore(),
      storage: createLocalAssetStorage({ rootDir }),
      idFactory: () => 'asset-1',
    })
    await service.uploadAsset({
      projectId: 'project-a', kind: 'audio', data: new Uint8Array([7]), mimeType: 'audio/mpeg',
    })

    await expect(service.removeAsset('asset-1')).resolves.toBe(true)
    await expect(service.getAssetContent('asset-1')).resolves.toBeNull()
    await expect(service.removeAsset('missing')).resolves.toBe(false)
  })
})
