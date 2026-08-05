import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createCanvasDocument,
  deleteCanvasDocument,
  formatUpdatedAt,
  loadDocumentSummaries,
  renameCanvasDocument,
} from './document-list-actions'

function response(body: unknown, status = 200): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => vi.restoreAllMocks())

describe('document list actions', () => {
  it('加载列表并格式化更新时间', async () => {
    const documents = [{ id: 'doc-a', name: '画布 A', updatedAt: '2026-08-05T12:34:00.000Z' }]
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(documents))

    await expect(loadDocumentSummaries()).resolves.toEqual(documents)
    expect(formatUpdatedAt(documents[0]?.updatedAt)).not.toMatch(/加载中|时间未知/)
  })

  it('新建时携带用户给出的名称', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ id: 'doc-new', name: '镜头草案' }, 201))

    await createCanvasDocument('镜头草案', { fwType: 'frame' })

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/documents', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: '镜头草案', root: { fwType: 'frame' } }),
    }))
  })

  it('重命名通过 PUT 只携带 name，避免覆盖自动保存中的画布树', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response({ id: 'doc-a', name: '分镜一' }))

    await renameCanvasDocument('doc-a', '分镜一')

    expect(globalThis.fetch).toHaveBeenCalledOnce()
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/documents/doc-a', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ name: '分镜一' }),
    }))
  })

  it('删除调用 DELETE，并把非成功状态转成错误', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(null, 204))
      .mockResolvedValueOnce(response({ error: 'document_not_found' }, 404))

    await expect(deleteCanvasDocument('doc/a')).resolves.toBeUndefined()
    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, '/api/documents/doc%2Fa', { method: 'DELETE' })
    await expect(deleteCanvasDocument('missing')).rejects.toThrow('HTTP 404')
  })
})
