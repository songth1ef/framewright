import { createFrameNode, type FrameNode } from '@framewright/core'
import { describe, expect, it, vi } from 'vitest'
import { createDocumentRouteHandlers, type DocumentRouteService } from './route-handler'

const root = createFrameNode({ fwId: 'root' })
const storedDocument = {
  id: 'doc-a',
  name: '画布 A',
  root,
  historySeq: 2,
  createdAt: new Date('2026-08-04T00:00:00.000Z'),
  updatedAt: new Date('2026-08-04T01:00:00.000Z'),
}

function createService(): DocumentRouteService {
  return {
    getDocument: vi.fn(async () => storedDocument),
    saveDocument: vi.fn(async () => storedDocument),
  }
}

const context = (id: string) => ({ params: Promise.resolve({ id }) })

describe('GET /api/documents/[id]', () => {
  it('只把合法 id 交给 server-core，并返回序列化后的 Document', async () => {
    const service = createService()
    const { GET } = createDocumentRouteHandlers(service)

    const response = await GET(new Request('http://localhost/api/documents/doc-a'), context('doc-a'))

    expect(service.getDocument).toHaveBeenCalledWith('doc-a')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ...storedDocument,
      createdAt: '2026-08-04T00:00:00.000Z',
      updatedAt: '2026-08-04T01:00:00.000Z',
    })
  })

  it('不存在时返回 404', async () => {
    const service = createService()
    vi.mocked(service.getDocument).mockResolvedValue(null)
    const { GET } = createDocumentRouteHandlers(service)

    const response = await GET(new Request('http://localhost/api/documents/missing'), context('missing'))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'document_not_found' })
  })

  it('空白 id 返回 400，且不调用 server-core', async () => {
    const service = createService()
    const { GET } = createDocumentRouteHandlers(service)

    const response = await GET(new Request('http://localhost/api/documents/x'), context('  '))

    expect(response.status).toBe(400)
    expect(service.getDocument).not.toHaveBeenCalled()
  })
})

describe('PUT /api/documents/[id]', () => {
  it('解析并校验请求体后调用 server-core', async () => {
    const service = createService()
    const { PUT } = createDocumentRouteHandlers(service)
    const body: { name: string; root: FrameNode; historySeq: number } = {
      name: '更新后的画布',
      root,
      historySeq: 3,
    }

    const response = await PUT(
      new Request('http://localhost/api/documents/doc-a', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      context('doc-a'),
    )

    expect(service.saveDocument).toHaveBeenCalledWith('doc-a', body)
    expect(response.status).toBe(200)
  })

  it.each([
    ['损坏的 JSON', '{'],
    ['缺少字段', JSON.stringify({ name: 'x', root })],
    ['非法 root', JSON.stringify({ name: 'x', root: { fwType: 'box' }, historySeq: 0 })],
    ['非法 historySeq', JSON.stringify({ name: 'x', root, historySeq: -1 })],
  ])('%s 返回 400，且不调用 server-core', async (_label, body) => {
    const service = createService()
    const { PUT } = createDocumentRouteHandlers(service)

    const response = await PUT(
      new Request('http://localhost/api/documents/doc-a', { method: 'PUT', body }),
      context('doc-a'),
    )

    expect(response.status).toBe(400)
    expect(service.saveDocument).not.toHaveBeenCalled()
  })

  it('Prisma P2025 映射为 404，其余异常映射为 500', async () => {
    const service = createService()
    const { PUT } = createDocumentRouteHandlers(service)
    const request = () =>
      new Request('http://localhost/api/documents/missing', {
        method: 'PUT',
        body: JSON.stringify({ name: 'x', root, historySeq: 0 }),
      })

    vi.mocked(service.saveDocument).mockRejectedValueOnce({ code: 'P2025' })
    expect((await PUT(request(), context('missing'))).status).toBe(404)

    vi.mocked(service.saveDocument).mockRejectedValueOnce(new Error('database offline'))
    expect((await PUT(request(), context('missing'))).status).toBe(500)
  })
})
