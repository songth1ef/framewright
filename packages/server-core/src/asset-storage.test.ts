import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLocalAssetStorage, type AssetStorage } from './asset-storage'

describe('LocalAssetStorage', () => {
  let rootDir: string
  let storage: AssetStorage

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'fw-assets-'))
    storage = createLocalAssetStorage({ rootDir })
  })

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true })
  })

  it('put 写入文件（含自动建嵌套目录），字节可原样读回', async () => {
    const data = new Uint8Array([1, 2, 3, 250, 4])

    await storage.put('proj-a/asset-1.png', data, 'image/png')

    const onDisk = await readFile(join(rootDir, 'proj-a', 'asset-1.png'))
    expect(new Uint8Array(onDisk)).toEqual(data)
  })

  it('getUrl 默认拼 /api/assets 前缀，可用 urlPrefix 覆盖', async () => {
    await expect(storage.getUrl('proj-a/asset-1.png')).resolves.toBe('/api/assets/proj-a/asset-1.png')

    const custom = createLocalAssetStorage({ rootDir, urlPrefix: '/static/assets' })
    await expect(custom.getUrl('proj-a/asset-1.png')).resolves.toBe('/static/assets/proj-a/asset-1.png')
  })

  it('delete 删除已存在的文件；删不存在的 key 不抛错', async () => {
    await storage.put('proj-a/asset-1.png', new Uint8Array([7]), 'image/png')

    await storage.delete('proj-a/asset-1.png')

    await expect(stat(join(rootDir, 'proj-a', 'asset-1.png'))).rejects.toThrow()
    await expect(storage.delete('proj-a/asset-1.png')).resolves.toBeUndefined()
    await expect(storage.delete('never-existed.png')).resolves.toBeUndefined()
  })

  it('拒绝越界 key：.. 路径、绝对路径、反斜杠一律抛错，不落盘', async () => {
    const data = new Uint8Array([1])
    for (const bad of ['../escape.png', 'a/../../escape.png', '/abs.png', 'C:\\x.png', 'a\\b.png', '']) {
      await expect(storage.put(bad, data, 'image/png')).rejects.toThrow()
      await expect(storage.delete(bad)).rejects.toThrow()
      await expect(storage.getUrl(bad)).rejects.toThrow()
    }
  })
})
