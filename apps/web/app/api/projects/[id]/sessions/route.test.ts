import { describe, expect, it, vi } from 'vitest'
import { createProjectSessionsRouteHandlers, type ProjectSessionsRouteService } from './route-handler'

const session = {
  id: 'session-a', projectId: 'project-a', title: '对话 A',
  createdAt: new Date('2026-08-04T00:00:00.000Z'), updatedAt: new Date('2026-08-04T00:00:00.000Z'),
}
const context = (id: string) => ({ params: Promise.resolve({ id }) })
function createService(): ProjectSessionsRouteService {
  return {
    listProjectSessions: vi.fn(async () => [session]),
    createSession: vi.fn(async () => session),
  }
}

describe('/api/projects/[id]/sessions', () => {
  it('GET 按 projectId 列出会话', async () => {
    const service = createService()
    const response = await createProjectSessionsRouteHandlers(service).GET(new Request('http://localhost/x'), context('project-a'))
    expect(service.listProjectSessions).toHaveBeenCalledWith('project-a')
    expect(response.status).toBe(200)
  })

  it('POST 创建属于该项目的会话', async () => {
    const service = createService()
    const response = await createProjectSessionsRouteHandlers(service).POST(
      new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ title: ' 对话 A ' }) }),
      context('project-a'),
    )
    expect(service.createSession).toHaveBeenCalledWith({ projectId: 'project-a', title: '对话 A' })
    expect(response.status).toBe(201)
  })

  it('POST 将外键缺失映射为 404', async () => {
    const service = createService()
    vi.mocked(service.createSession).mockRejectedValueOnce({ code: 'P2003' })
    const response = await createProjectSessionsRouteHandlers(service).POST(
      new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ title: 'x' }) }),
      context('missing'),
    )
    expect(response.status).toBe(404)
  })
})

