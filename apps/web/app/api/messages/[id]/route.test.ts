import { describe, expect, it, vi } from 'vitest'
import { createMessageRouteHandlers, type MessageRouteService } from './route-handler'

const message = {
  id: 'message-a', sessionId: 'session-a', seq: 1, role: 'assistant' as const, content: '完成',
  generationIds: ['generation-a'], nodeFwIds: ['node-a'], documentId: 'document-a',
  createdAt: new Date('2026-08-04T00:00:00.000Z'),
}
const context = (id: string) => ({ params: Promise.resolve({ id }) })

describe('GET /api/messages/[id]', () => {
  it('正查消息及其 generationIds/nodeFwIds', async () => {
    const service: MessageRouteService = { getMessage: vi.fn(async () => message) }
    const response = await createMessageRouteHandlers(service).GET(new Request('http://localhost/x'), context('message-a'))
    expect(service.getMessage).toHaveBeenCalledWith('message-a')
    await expect(response.json()).resolves.toMatchObject({ generationIds: ['generation-a'], nodeFwIds: ['node-a'] })
  })
})

