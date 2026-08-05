import { describe, expect, it, vi } from 'vitest'
import { createSessionMessagesRouteHandlers, type SessionMessagesRouteService } from './route-handler'

const message = {
  id: 'message-a', sessionId: 'session-a', seq: 1, role: 'user' as const, content: '生成一张图',
  generationIds: [], nodeFwIds: [], documentId: 'document-a', createdAt: new Date('2026-08-04T00:00:00.000Z'),
}
const context = (id: string) => ({ params: Promise.resolve({ id }) })
function createService(): SessionMessagesRouteService {
  return { listMessages: vi.fn(async () => [message]), appendMessage: vi.fn(async () => message) }
}

describe('/api/sessions/[id]/messages', () => {
  it('GET 按 seq 顺序结果透传 server-core', async () => {
    const service = createService()
    const response = await createSessionMessagesRouteHandlers(service).GET(new Request('http://localhost/x'), context('session-a'))
    expect(service.listMessages).toHaveBeenCalledWith('session-a')
    expect(response.status).toBe(200)
  })

  it('POST 只提交消息内容，不在路由中分配 seq', async () => {
    const service = createService()
    const input = { role: 'user', content: ' 生成一张图 ', generationIds: ['generation-a'], nodeFwIds: ['node-a'], documentId: 'document-a' }
    const response = await createSessionMessagesRouteHandlers(service).POST(
      new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(input) }),
      context('session-a'),
    )
    expect(service.appendMessage).toHaveBeenCalledWith('session-a', { ...input, content: '生成一张图' })
    expect(response.status).toBe(201)
  })

  it.each([
    JSON.stringify({ role: 'bad', content: 'x' }),
    JSON.stringify({ role: 'user', content: ' ' }),
    JSON.stringify({ role: 'user', content: 'x', generationIds: [1] }),
  ])('POST 拒绝非法消息 %#', async (body) => {
    const service = createService()
    const response = await createSessionMessagesRouteHandlers(service).POST(
      new Request('http://localhost/x', { method: 'POST', body }), context('session-a'),
    )
    expect(response.status).toBe(400)
    expect(service.appendMessage).not.toHaveBeenCalled()
  })
})

