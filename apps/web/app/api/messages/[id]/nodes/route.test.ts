import { describe, expect, it, vi } from 'vitest'
import { createMessageNodesRouteHandlers, type MessageNodesRouteService } from './route-handler'

const context = (id: string) => ({ params: Promise.resolve({ id }) })

describe('POST /api/messages/[id]/nodes', () => {
  it('调用 server-core 追加正向 nodeFwId 索引', async () => {
    const service: MessageNodesRouteService = { linkNodeFwIds: vi.fn(async () => ({ ok: true })) }
    const response = await createMessageNodesRouteHandlers(service).POST(
      new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ nodeFwIds: ['node-a'] }) }), context('message-a'),
    )
    expect(service.linkNodeFwIds).toHaveBeenCalledWith('message-a', ['node-a'])
    expect(response.status).toBe(200)
  })
})

