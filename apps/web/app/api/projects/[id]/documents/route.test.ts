import { describe, expect, it, vi } from 'vitest'
import { createProjectDocumentsRouteHandlers, type ProjectDocumentsRouteService } from './route-handler'

const context = (id: string) => ({ params: Promise.resolve({ id }) })

describe('GET /api/projects/[id]/documents', () => {
  it('按 projectId 列举画布', async () => {
    const service: ProjectDocumentsRouteService = { listProjectDocuments: vi.fn(async () => []) }
    const response = await createProjectDocumentsRouteHandlers(service).GET(
      new Request('http://localhost/x'),
      context('project-a'),
    )
    expect(service.listProjectDocuments).toHaveBeenCalledWith('project-a')
    expect(response.status).toBe(200)
  })

  it('非法 projectId 返回 400', async () => {
    const service: ProjectDocumentsRouteService = { listProjectDocuments: vi.fn(async () => []) }
    const response = await createProjectDocumentsRouteHandlers(service).GET(
      new Request('http://localhost/x'),
      context(' '),
    )
    expect(response.status).toBe(400)
    expect(service.listProjectDocuments).not.toHaveBeenCalled()
  })
})

