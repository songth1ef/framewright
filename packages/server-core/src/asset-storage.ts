/**
 * 素材存储抽象（`docs/backend-domain.md` §4）。
 *
 * 硬约束（`AGENTS.md` §2）：存储必须可替换——server-core 只认这里的
 * `AssetStorage` 接口，仓内只保留本地文件实现；生产对象存储实现留空，
 * 由部署方按同一接口提供。
 */

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface AssetStorage {
  /** 把字节写入 key 指向的位置（本地=相对路径，生产=对象存储 key）。 */
  put(key: string, data: Uint8Array, mimeType: string): Promise<void>
  /** 取可访问 URL。本地实现返回走 Route Handler 的相对 URL；生产实现返回签名 URL。 */
  getUrl(key: string): Promise<string>
  /** 删除 key 指向的文件；key 不存在时不视为错误。 */
  delete(key: string): Promise<void>
}

export interface LocalAssetStorageOptions {
  /** 本地文件根目录，约定为仓根的 `.data/assets/`（gitignored，由编排方配置）。 */
  rootDir: string
  /** getUrl 的 URL 前缀，默认 `/api/assets`（对应 apps/web 的 Route Handler）。 */
  urlPrefix?: string
}

/**
 * 校验 storage key 必须是安全的相对路径：非空、无 `..`、非绝对路径、无反斜杠。
 * key 由 server-core 内部生成（`<projectId>/<assetId>.<ext>`），这里做防御性兜底，
 * 防止任何未来调用方把外部输入直接当 key 写穿根目录。
 */
function assertSafeKey(key: string): void {
  const segments = key.split('/')
  const safe =
    key.length > 0 &&
    !key.includes('\\') &&
    !key.startsWith('/') &&
    !/^[A-Za-z]:/.test(key) &&
    segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
  if (!safe) {
    throw new Error(`非法的 storage key：${JSON.stringify(key)}`)
  }
}

/** 本地开发实现：文件落在 `rootDir` 下，getUrl 返回 `<urlPrefix>/<key>`。 */
export function createLocalAssetStorage(options: LocalAssetStorageOptions): AssetStorage {
  const urlPrefix = options.urlPrefix ?? '/api/assets'
  return {
    async put(key, data, _mimeType) {
      assertSafeKey(key)
      const filePath = join(options.rootDir, key)
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, data)
    },

    async getUrl(key) {
      assertSafeKey(key)
      return `${urlPrefix}/${key}`
    },

    async delete(key) {
      assertSafeKey(key)
      await rm(join(options.rootDir, key), { force: true })
    },
  }
}
