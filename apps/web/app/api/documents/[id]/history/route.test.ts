import { createBoxNode, type CanvasOp } from '@framewright/core'
import { describe, expect, it, vi } from 'vitest'
import { createHistoryRouteHandlers, type HistoryRouteService } from './route-handler'

const op: CanvasOp = {
  kind: 'move-node',
  fwId: 'box-a',
  from: { parentFwId: 'root', index: 0, x: 0, y: 0 },
  to: { parentFwId: 'root', index: 0, x: 20, y: 30 },
}

const entry = {
  id: 'history-a',
  documentId: 'doc-a',
  seq: 1,
  op,
  createdAt: new Date('2026-08-04T00:00:00.000Z'),
}

function createService(): HistoryRouteService {
  return {
    getHistory: vi.fn(async () => [entry]),
    appendHistory: vi.fn(async () => entry),
  }
}

const context = (id: string) => ({ params: Promise.resolve({ id }) })

describe('GET /api/documents/[id]/history', () => {
  it('按 documentId 调用 server-core 并返回历史条目', async () => {
    const service = createService()
    const { GET } = createHistoryRouteHandlers(service)

    const response = await GET(
      new Request('http://localhost/api/documents/doc-a/history'),
      context('doc-a'),
    )

    expect(service.getHistory).toHaveBeenCalledWith('doc-a')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      { ...entry, createdAt: '2026-08-04T00:00:00.000Z' },
    ])
  })

  it('空白 id 返回 400', async () => {
    const service = createService()
    const { GET } = createHistoryRouteHandlers(service)
    const response = await GET(new Request('http://localhost/x'), context(' '))
    expect(response.status).toBe(400)
    expect(service.getHistory).not.toHaveBeenCalled()
  })
})

describe('POST /api/documents/[id]/history', () => {
  it('校验 CanvasOp 后交给 server-core 追加', async () => {
    const service = createService()
    const { POST } = createHistoryRouteHandlers(service)

    const response = await POST(
      new Request('http://localhost/api/documents/doc-a/history', {
        method: 'POST',
        body: JSON.stringify({ op }),
      }),
      context('doc-a'),
    )

    expect(service.appendHistory).toHaveBeenCalledWith('doc-a', op)
    expect(response.status).toBe(201)
  })

  it.each([
    ['损坏 JSON', '{'],
    ['缺少 op', '{}'],
    ['未知操作', JSON.stringify({ op: { kind: 'unknown' } })],
    [
      '损坏的节点操作',
      JSON.stringify({
        op: {
          kind: 'add-node',
          slot: { parentFwId: 'root', index: 0, x: 0, y: 0 },
          node: createBoxNode({ fwId: 'box-a' }),
        },
      }),
    ],
  ])('%s 返回 400', async (_label, body) => {
    const service = createService()
    const { POST } = createHistoryRouteHandlers(service)
    const response = await POST(
      new Request('http://localhost/x', { method: 'POST', body }),
      context('doc-a'),
    )
    expect(response.status).toBe(400)
    expect(service.appendHistory).not.toHaveBeenCalled()
  })

  it('唯一序号冲突映射为 409，Document 不存在映射为 404', async () => {
    const service = createService()
    const { POST } = createHistoryRouteHandlers(service)
    const request = () =>
      new Request('http://localhost/x', {
        method: 'POST',
        body: JSON.stringify({ op }),
      })

    vi.mocked(service.appendHistory).mockRejectedValueOnce({ code: 'P2002' })
    expect((await POST(request(), context('doc-a'))).status).toBe(409)

    vi.mocked(service.appendHistory).mockRejectedValueOnce({ code: 'P2025' })
    expect((await POST(request(), context('missing'))).status).toBe(404)
  })
})
