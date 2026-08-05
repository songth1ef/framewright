import { describe, expect, it, vi } from 'vitest'
import { createMessageGenerationsRouteHandlers, type MessageGenerationsRouteService } from './route-handler'

const context = (id: string) => ({ params: Promise.resolve({ id }) })

describe('POST /api/messages/[id]/generations', () => {
  it('调用 server-core 追加正向 generation 索引', async () => {
    const service: MessageGenerationsRouteService = { linkGenerations: vi.fn(async () => ({ ok: true })) }
    const response = await createMessageGenerationsRouteHandlers(service).POST(
      new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ generationIds: ['g-a', 'g-b'] }) }),
      context('message-a'),
    )
    expect(service.linkGenerations).toHaveBeenCalledWith('message-a', ['g-a', 'g-b'])
    expect(response.status).toBe(200)
  })

  it('拒绝空数组', async () => {
    const service: MessageGenerationsRouteService = { linkGenerations: vi.fn() }
    const response = await createMessageGenerationsRouteHandlers(service).POST(
      new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ generationIds: [] }) }), context('message-a'),
    )
    expect(response.status).toBe(400)
  })
})

