import type { Asset as PrismaAsset, PrismaClient } from '@prisma/client'
import { prisma } from './prisma'

/**
 * Asset 记录的存取（`docs/backend-domain.md` §4）。
 *
 * 职责边界：本模块只管数据库记录，不碰文件字节——字节读写走
 * `asset-storage.ts` 的 `AssetStorage` 接口。删除素材时由上层编排
 * （如 generation-service）同时调 `deleteAsset` 与 `storage.delete`。
 */

export type AssetKind = 'image' | 'video' | 'audio'
export type AssetOrigin = 'upload' | 'generated'

export interface StoredAsset {
  id: string
  projectId: string
  kind: AssetKind
  origin: AssetOrigin
  /** 存储位置。本地开发是相对路径，生产是对象存储 key。 */
  storageKey: string
  mimeType: string
  byteSize: number
  width: number | null
  height: number | null
  /** 仅视频/音频 */
  durationMs: number | null
  /** 生成而来的素材指回它的生成任务，只做索引不建外键 */
  generationId: string | null
  createdAt: Date
}

export interface CreateAssetInput {
  id?: string
  projectId: string
  kind: AssetKind
  origin: AssetOrigin
  storageKey: string
  mimeType: string
  byteSize: number
  width?: number
  height?: number
  durationMs?: number
  generationId?: string
}

export interface AssetStore {
  createAsset(input: CreateAssetInput): Promise<StoredAsset>
  getAsset(assetId: string): Promise<StoredAsset | null>
  /** 按创建时间倒序列出项目全部素材。 */
  listProjectAssets(projectId: string): Promise<StoredAsset[]>
  /** 回溯反查：某次生成任务产出的全部素材。 */
  listGenerationAssets(generationId: string): Promise<StoredAsset[]>
  /** 只删数据库记录，存储文件由调用方经 AssetStorage 删除。asset 不存在时抛 P2025。 */
  deleteAsset(assetId: string): Promise<void>
}

function toStoredAsset(asset: PrismaAsset): StoredAsset {
  return {
    id: asset.id,
    projectId: asset.projectId,
    kind: asset.kind as AssetKind,
    origin: asset.origin as AssetOrigin,
    storageKey: asset.storageKey,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    generationId: asset.generationId,
    createdAt: asset.createdAt,
  }
}

export function createAssetStore(client: PrismaClient): AssetStore {
  return {
    async createAsset(input) {
      const asset = await client.asset.create({
        data: {
          ...(input.id === undefined ? {} : { id: input.id }),
          projectId: input.projectId,
          kind: input.kind,
          origin: input.origin,
          storageKey: input.storageKey,
          mimeType: input.mimeType,
          byteSize: input.byteSize,
          ...(input.width === undefined ? {} : { width: input.width }),
          ...(input.height === undefined ? {} : { height: input.height }),
          ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
          ...(input.generationId === undefined ? {} : { generationId: input.generationId }),
        },
      })
      return toStoredAsset(asset)
    },

    async getAsset(assetId) {
      const asset = await client.asset.findUnique({ where: { id: assetId } })
      return asset === null ? null : toStoredAsset(asset)
    },

    async listProjectAssets(projectId) {
      const assets = await client.asset.findMany({
        where: { projectId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })
      return assets.map(toStoredAsset)
    },

    async listGenerationAssets(generationId) {
      const assets = await client.asset.findMany({
        where: { generationId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })
      return assets.map(toStoredAsset)
    },

    async deleteAsset(assetId) {
      await client.asset.delete({ where: { id: assetId } })
    },
  }
}

const defaultStore = createAssetStore(prisma)

export const createAsset = defaultStore.createAsset
export const getAsset = defaultStore.getAsset
export const listProjectAssets = defaultStore.listProjectAssets
export const listGenerationAssets = defaultStore.listGenerationAssets
export const deleteAsset = defaultStore.deleteAsset
