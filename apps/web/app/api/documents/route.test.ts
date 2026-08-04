import { createDemoDocument } from '@framewright/core'
import { describe, expect, it, vi } from 'vitest'
import { createDocumentsRouteHandlers, type DocumentsRouteService } from './route-handler'

const root = createDemoDocument()
const document = {
  id: 'doc-a',
  name: '新画布',
  root,
  historySeq: 0,
  createdAt: new Date('2026-08-04T00:00:00.000Z'),
  updatedAt: new Date('2026-08-04T00:00:00.000Z'),
}

function createService(): DocumentsRouteService {
  return {
    listDocuments: vi.fn(async () => [document]),
    createDocument: vi.fn(async () => document),
  }
}

describe('GET /api/documents', () => {
  it('返回已有画布列表', async () => {
    const service = createService()
    const { GET } = createDocumentsRouteHandlers(service)
    const response = await GET()

    expect(service.listDocuments).toHaveBeenCalledOnce()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      {
        ...document,
        createdAt: '2026-08-04T00:00:00.000Z',
        updatedAt: '2026-08-04T00:00:00.000Z',
      },
    ])
  })
})

describe('POST /api/documents', () => {
  it('校验名称与根节点后创建画布', async () => {
    const service = createService()
    const { POST } = createDocumentsRouteHandlers(service)
    const response = await POST(
      new Request('http://localhost/api/documents', {
        method: 'POST',
        body: JSON.stringify({ name: ' 新画布 ', root }),
      }),
    )

    expect(service.createDocument).toHaveBeenCalledWith({ name: '新画布', root })
    expect(response.status).toBe(201)
  })

  it.each([
    ['损坏 JSON', '{'],
    ['空名称', JSON.stringify({ name: ' ', root })],
    ['非法根节点', JSON.stringify({ name: '新画布', root: {} })],
  ])('%s 返回 400', async (_label, body) => {
    const service = createService()
    const { POST } = createDocumentsRouteHandlers(service)
    const response = await POST(
      new Request('http://localhost/api/documents', { method: 'POST', body }),
    )

    expect(response.status).toBe(400)
    expect(service.createDocument).not.toHaveBeenCalled()
  })
})
