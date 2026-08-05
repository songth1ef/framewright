import { describe, expect, it, vi } from 'vitest'
import { createSessionRouteHandlers, type SessionRouteService } from './route-handler'

const session = {
  id: 'session-a', projectId: 'project-a', title: '对话 A',
  createdAt: new Date('2026-08-04T00:00:00.000Z'), updatedAt: new Date('2026-08-04T00:00:00.000Z'),
}
const context = (id: string) => ({ params: Promise.resolve({ id }) })
function createService(): SessionRouteService {
  return {
    getSession: vi.fn(async () => session),
    renameSession: vi.fn(async () => session),
    deleteSession: vi.fn(async () => undefined),
  }
}

describe('/api/sessions/[id]', () => {
  it('GET 返回单个会话', async () => {
    const service = createService()
    const response = await createSessionRouteHandlers(service).GET(new Request('http://localhost/x'), context('session-a'))
    expect(service.getSession).toHaveBeenCalledWith('session-a')
    expect(response.status).toBe(200)
  })

  it('PATCH 重命名会话', async () => {
    const service = createService()
    const response = await createSessionRouteHandlers(service).PATCH(
      new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify({ title: ' 新标题 ' }) }),
      context('session-a'),
    )
    expect(service.renameSession).toHaveBeenCalledWith('session-a', '新标题')
    expect(response.status).toBe(200)
  })

  it('DELETE 删除会话并返回 204', async () => {
    const service = createService()
    const response = await createSessionRouteHandlers(service).DELETE(new Request('http://localhost/x'), context('session-a'))
    expect(service.deleteSession).toHaveBeenCalledWith('session-a')
    expect(response.status).toBe(204)
  })
})

