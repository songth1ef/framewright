import type { AssetContent } from '@framewright/server-core'
import { describe, expect, it, vi } from 'vitest'
import { createAssetRouteHandlers, type AssetRouteService } from './route-handler'

const content: AssetContent = {
  asset: {
    id: 'asset-a', projectId: 'project-a', kind: 'image', origin: 'upload',
    storageKey: 'project-a/asset-a.png', mimeType: 'image/png', byteSize: 3,
    width: 1, height: 1, durationMs: null, generationId: null,
    createdAt: new Date('2026-08-04T00:00:00.000Z'),
  },
  data: new Uint8Array([1, 2, 3]),
}
const context = (id: string) => ({ params: Promise.resolve({ id }) })

function createService(): AssetRouteService {
  return {
    getAssetContent: vi.fn(async () => content),
    removeAsset: vi.fn(async () => true),
  }
}

describe('/api/assets/[id]', () => {
  it('GET 返回素材字节与内容响应头', async () => {
    const service = createService()
    const response = await createAssetRouteHandlers(service).GET(
      new Request('http://localhost/x'), context('asset-a'),
    )

    expect(service.getAssetContent).toHaveBeenCalledWith('asset-a')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('content-length')).toBe('3')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(content.data)
  })

  it('GET 缺失返回 404，存储异常返回 500', async () => {
    const service = createService()
    vi.mocked(service.getAssetContent).mockResolvedValueOnce(null)
    const handlers = createAssetRouteHandlers(service)
    expect((await handlers.GET(new Request('http://localhost/x'), context('missing'))).status).toBe(404)
    vi.mocked(service.getAssetContent).mockRejectedValueOnce(new Error('disk failure'))
    expect((await handlers.GET(new Request('http://localhost/x'), context('asset-a'))).status).toBe(500)
  })

  it('DELETE 同时删除记录和文件，缺失返回 404', async () => {
    const service = createService()
    const handlers = createAssetRouteHandlers(service)
    expect((await handlers.DELETE(new Request('http://localhost/x'), context('asset-a'))).status).toBe(204)
    expect(service.removeAsset).toHaveBeenCalledWith('asset-a')
    vi.mocked(service.removeAsset).mockResolvedValueOnce(false)
    expect((await handlers.DELETE(new Request('http://localhost/x'), context('missing'))).status).toBe(404)
  })

  it('拒绝非法 asset id', async () => {
    const service = createService()
    const response = await createAssetRouteHandlers(service).GET(
      new Request('http://localhost/x'), context(' '),
    )
    expect(response.status).toBe(400)
    expect(service.getAssetContent).not.toHaveBeenCalled()
  })
})
