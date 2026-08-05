import { describe, expect, it, vi } from 'vitest'
import { createNodeMessageRouteHandlers, type NodeMessageRouteService } from './route-handler'

const context = (id: string, nodeFwId: string) => ({ params: Promise.resolve({ id, nodeFwId }) })

describe('GET /api/documents/[id]/nodes/[nodeFwId]/message', () => {
  it('用 documentId 与 nodeFwId 反查来源消息', async () => {
    const service: NodeMessageRouteService = { findMessageByNodeFwId: vi.fn(async () => ({ id: 'message-a' })) }
    const response = await createNodeMessageRouteHandlers(service).GET(
      new Request('http://localhost/x'), context('document-a', 'node-a'),
    )
    expect(service.findMessageByNodeFwId).toHaveBeenCalledWith('document-a', 'node-a')
    expect(response.status).toBe(200)
  })

  it('没有来源消息时返回 404', async () => {
    const service: NodeMessageRouteService = { findMessageByNodeFwId: vi.fn(async () => null) }
    const response = await createNodeMessageRouteHandlers(service).GET(
      new Request('http://localhost/x'), context('document-a', 'node-a'),
    )
    expect(response.status).toBe(404)
  })
})

