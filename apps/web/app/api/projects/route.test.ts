import { describe, expect, it, vi } from 'vitest'
import { createProjectsRouteHandlers, type ProjectsRouteService } from './route-handler'

const project = {
  id: 'project-a',
  name: '项目 A',
  description: '描述',
  coverAssetId: null,
  createdAt: new Date('2026-08-04T00:00:00.000Z'),
  updatedAt: new Date('2026-08-04T01:00:00.000Z'),
}

function createService(): ProjectsRouteService {
  return {
    listProjects: vi.fn(async () => [project]),
    createProject: vi.fn(async () => project),
  }
}

describe('/api/projects', () => {
  it('GET 返回项目列表', async () => {
    const service = createService()
    const response = await createProjectsRouteHandlers(service).GET()
    expect(service.listProjects).toHaveBeenCalledOnce()
    expect(response.status).toBe(200)
  })

  it('POST 校验并创建项目', async () => {
    const service = createService()
    const response = await createProjectsRouteHandlers(service).POST(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: ' 项目 A ', description: ' 描述 ' }),
      }),
    )
    expect(service.createProject).toHaveBeenCalledWith({ name: '项目 A', description: '描述' })
    expect(response.status).toBe(201)
  })

  it.each(['{', '{}', JSON.stringify({ name: ' ' }), JSON.stringify({ name: 'x', description: 1 })])(
    'POST 拒绝非法请求体 %#',
    async (body) => {
      const service = createService()
      const response = await createProjectsRouteHandlers(service).POST(
        new Request('http://localhost/api/projects', { method: 'POST', body }),
      )
      expect(response.status).toBe(400)
      expect(service.createProject).not.toHaveBeenCalled()
    },
  )
})

