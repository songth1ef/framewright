import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLocalAssetStorage, type AssetStorage } from './asset-storage'
import {
  createAsset,
  deleteAsset,
  getAsset,
  type AssetKind,
  type AssetStore,
  type StoredAsset,
} from './asset-store'

export interface UploadAssetInput {
  projectId: string
  kind: AssetKind
  data: Uint8Array
  mimeType: string
  width?: number
  height?: number
  durationMs?: number
}

export interface AssetContent {
  asset: StoredAsset
  data: Uint8Array
}

export interface AssetService {
  uploadAsset(input: UploadAssetInput): Promise<StoredAsset>
  getAssetContent(assetId: string): Promise<AssetContent | null>
  removeAsset(assetId: string): Promise<boolean>
}

export interface AssetServiceDependencies {
  assetStore: AssetStore
  storage: AssetStorage
  idFactory?: () => string
}

const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
}

function safeStorageSegment(value: string): string {
  return encodeURIComponent(value).replaceAll('.', '%2E')
}

export function createAssetService(dependencies: AssetServiceDependencies): AssetService {
  const idFactory = dependencies.idFactory ?? randomUUID
  return {
    async uploadAsset(input) {
      const assetId = idFactory()
      const extension = EXTENSION_BY_MIME[input.mimeType] ?? ''
      const storageKey = `${safeStorageSegment(input.projectId)}/${safeStorageSegment(assetId)}${extension}`
      await dependencies.storage.put(storageKey, input.data, input.mimeType)
      try {
        return await dependencies.assetStore.createAsset({
          id: assetId,
          projectId: input.projectId,
          kind: input.kind,
          origin: 'upload',
          storageKey,
          mimeType: input.mimeType,
          byteSize: input.data.byteLength,
          ...(input.width === undefined ? {} : { width: input.width }),
          ...(input.height === undefined ? {} : { height: input.height }),
          ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
        })
      } catch (error) {
        await dependencies.storage.delete(storageKey)
        throw error
      }
    },

    async getAssetContent(assetId) {
      const asset = await dependencies.assetStore.getAsset(assetId)
      if (asset === null) return null
      const data = await dependencies.storage.get(asset.storageKey)
      if (data === null) throw new Error(`素材文件不存在：${asset.id}`)
      return { asset, data }
    },

    async removeAsset(assetId) {
      const asset = await dependencies.assetStore.getAsset(assetId)
      if (asset === null) return false
      await dependencies.storage.delete(asset.storageKey)
      await dependencies.assetStore.deleteAsset(assetId)
      return true
    },
  }
}

const packageDirectory = path.dirname(fileURLToPath(import.meta.url))
export const DEFAULT_LOCAL_ASSET_ROOT = path.resolve(packageDirectory, '../../../.data/assets')

const defaultService = createAssetService({
  assetStore: { createAsset, getAsset, listProjectAssets: async () => [], listGenerationAssets: async () => [], deleteAsset },
  storage: createLocalAssetStorage({ rootDir: DEFAULT_LOCAL_ASSET_ROOT }),
})

export const uploadAsset = defaultService.uploadAsset
export const getAssetContent = defaultService.getAssetContent
export const removeAsset = defaultService.removeAsset
