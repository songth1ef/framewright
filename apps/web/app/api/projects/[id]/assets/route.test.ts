import type { StoredAsset } from '@framewright/server-core'
import { describe, expect, it, vi } from 'vitest'
import { createProjectAssetsRouteHandlers, type ProjectAssetsRouteService } from './route-handler'

const asset: StoredAsset = {
  id: 'asset-a', projectId: 'project-a', kind: 'image', origin: 'upload',
  storageKey: 'project-a/asset-a.png', mimeType: 'image/png', byteSize: 3,
  width: 640, height: 360, durationMs: null, generationId: null,
  createdAt: new Date('2026-08-04T00:00:00.000Z'),
}
const context = (id: string) => ({ params: Promise.resolve({ id }) })

function createService(): ProjectAssetsRouteService {
  return {
    listProjectAssets: vi.fn(async () => [asset]),
    uploadAsset: vi.fn(async () => asset),
  }
}

describe('/api/projects/[id]/assets', () => {
  it('GET 按项目列出素材', async () => {
    const service = createService()
    const response = await createProjectAssetsRouteHandlers(service).GET(
      new Request('http://localhost/x'), context(' project-a '),
    )

    expect(service.listProjectAssets).toHaveBeenCalledWith('project-a')
    expect(response.status).toBe(200)
  })

  it('POST 校验 multipart 字段后上传素材并返回 201', async () => {
    const service = createService()
    const body = new FormData()
    body.set('file', new File([new Uint8Array([1, 2, 3])], 'neutral.png', { type: 'image/png' }))
    body.set('kind', 'image')
    body.set('width', '640')
    body.set('height', '360')

    const response = await createProjectAssetsRouteHandlers(service).POST(
      new Request('http://localhost/x', { method: 'POST', body }), context('project-a'),
    )

    expect(service.uploadAsset).toHaveBeenCalledWith({
      projectId: 'project-a', kind: 'image', mimeType: 'image/png',
      data: new Uint8Array([1, 2, 3]), width: 640, height: 360,
    })
    expect(response.status).toBe(201)
  })

  it.each([
    ['无文件', new FormData()],
    ['kind 与 MIME 不匹配', (() => {
      const body = new FormData()
      body.set('file', new File(['x'], 'neutral.txt', { type: 'text/plain' }))
      body.set('kind', 'image')
      return body
    })()],
    ['非法尺寸', (() => {
      const body = new FormData()
      body.set('file', new File(['x'], 'neutral.png', { type: 'image/png' }))
      body.set('kind', 'image')
      body.set('width', '-1')
      return body
    })()],
  ])('POST %s 返回 400', async (_label, body) => {
    const service = createService()
    const response = await createProjectAssetsRouteHandlers(service).POST(
      new Request('http://localhost/x', { method: 'POST', body }), context('project-a'),
    )

    expect(response.status).toBe(400)
    expect(service.uploadAsset).not.toHaveBeenCalled()
  })

  it('POST 把项目外键错误映射为 404', async () => {
    const service = createService()
    vi.mocked(service.uploadAsset).mockRejectedValueOnce({ code: 'P2003' })
    const body = new FormData()
    body.set('file', new File(['x'], 'neutral.png', { type: 'image/png' }))
    body.set('kind', 'image')

    const response = await createProjectAssetsRouteHandlers(service).POST(
      new Request('http://localhost/x', { method: 'POST', body }), context('missing'),
    )
    expect(response.status).toBe(404)
  })
})
