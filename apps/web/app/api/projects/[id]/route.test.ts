import { describe, expect, it, vi } from 'vitest'
import { createProjectRouteHandlers, type ProjectRouteService } from './route-handler'

const project = {
  id: 'project-a',
  name: '项目 A',
  description: null,
  coverAssetId: null,
  createdAt: new Date('2026-08-04T00:00:00.000Z'),
  updatedAt: new Date('2026-08-04T01:00:00.000Z'),
}
const context = (id: string) => ({ params: Promise.resolve({ id }) })

function createService(): ProjectRouteService {
  return {
    getProject: vi.fn(async () => project),
    updateProject: vi.fn(async () => project),
  }
}

describe('/api/projects/[id]', () => {
  it('GET 返回项目，缺失返回 404', async () => {
    const service = createService()
    const handlers = createProjectRouteHandlers(service)
    expect((await handlers.GET(new Request('http://localhost/x'), context('project-a'))).status).toBe(200)
    vi.mocked(service.getProject).mockResolvedValueOnce(null)
    expect((await handlers.GET(new Request('http://localhost/x'), context('missing'))).status).toBe(404)
  })

  it('PATCH 只传递合法的部分更新字段', async () => {
    const service = createService()
    const response = await createProjectRouteHandlers(service).PATCH(
      new Request('http://localhost/x', {
        method: 'PATCH',
        body: JSON.stringify({ name: ' 新名称 ', description: null, coverAssetId: ' asset-a ' }),
      }),
      context('project-a'),
    )
    expect(service.updateProject).toHaveBeenCalledWith('project-a', {
      name: '新名称',
      description: null,
      coverAssetId: 'asset-a',
    })
    expect(response.status).toBe(200)
  })

  it('PATCH 拒绝空更新，并把 P2025 映射为 404', async () => {
    const service = createService()
    const handlers = createProjectRouteHandlers(service)
    expect((await handlers.PATCH(new Request('http://localhost/x', { method: 'PATCH', body: '{}' }), context('project-a'))).status).toBe(400)
    vi.mocked(service.updateProject).mockRejectedValueOnce({ code: 'P2025' })
    const response = await handlers.PATCH(
      new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify({ name: 'x' }) }),
      context('missing'),
    )
    expect(response.status).toBe(404)
  })
})

