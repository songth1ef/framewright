import { createFrameNode, invertOp, type CanvasOp } from '@framewright/core'
import { describe, expect, it, vi } from 'vitest'
import { loadServerHistory } from './server-history'

function makeMoveOp(x: number): CanvasOp {
  return {
    kind: 'move-node',
    fwId: 'box-a',
    from: { parentFwId: 'root', index: 0, x, y: 0 },
    to: { parentFwId: 'root', index: 0, x: x + 1, y: 0 },
  }
}

const ROOT = createFrameNode({ fwId: 'root' })

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

interface FakeBackend {
  entries: Array<{ id: string; documentId: string; seq: number; op: CanvasOp; createdAt: string }>
  historySeq: number
}

/** 模拟 F3/F4 的后端行为：GET 全量、PUT 写回 historySeq、POST 丢弃重放分支后追加并推进 historySeq。 */
function createFakeFetch(backend: FakeBackend) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { op: CanvasOp }
      backend.entries = backend.entries.filter((entry) => entry.seq <= backend.historySeq)
      backend.historySeq += 1
      const entry = {
        id: `entry-${backend.historySeq}`,
        documentId: 'doc-a',
        seq: backend.historySeq,
        op: body.op,
        createdAt: new Date().toISOString(),
      }
      backend.entries.push(entry)
      return jsonResponse(entry, 201)
    }
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as { historySeq: number }
      backend.historySeq = body.historySeq
      return jsonResponse({ id: 'doc-a', historySeq: backend.historySeq })
    }
    if (url.endsWith('/history')) return jsonResponse(backend.entries)
    return jsonResponse({ id: 'doc-a', historySeq: backend.historySeq })
  })
}

function seedBackend(opCount: number): FakeBackend {
  const backend: FakeBackend = { entries: [], historySeq: 0 }
  for (let i = 1; i <= opCount; i += 1) {
    backend.entries.push({
      id: `entry-${i}`,
      documentId: 'doc-a',
      seq: i,
      op: makeMoveOp(i * 10),
      createdAt: new Date().toISOString(),
    })
  }
  backend.historySeq = opCount
  return backend
}

const getRoot = () => ROOT

describe('server history（U2：操作栈写后端、跨会话撤销）', () => {
  it('加载后游标停在 historySeq，undo 返回最后一条的逆操作（跨会话撤销）', async () => {
    const backend = seedBackend(2)
    const history = await loadServerHistory('doc-a', { fetch: createFakeFetch(backend), getRoot })

    expect(history.getHistorySeq()).toBe(2)
    expect(history.undo()).toEqual(invertOp(makeMoveOp(20)))
    expect(history.getHistorySeq()).toBe(1)
    expect(history.undo()).toEqual(invertOp(makeMoveOp(10)))
    expect(history.getHistorySeq()).toBe(0)
    expect(history.undo()).toBeNull()
  })

  it('redo 返回正向操作，到顶后返回 null', async () => {
    const backend = seedBackend(2)
    const history = await loadServerHistory('doc-a', { fetch: createFakeFetch(backend), getRoot })

    history.undo()
    expect(history.redo()).toEqual(makeMoveOp(20))
    expect(history.getHistorySeq()).toBe(2)
    expect(history.redo()).toBeNull()
  })

  it('刷新后从上次撤销位置继续（加载时尊重后端 historySeq 而非条目数）', async () => {
    const backend = seedBackend(3)
    backend.historySeq = 1 // 上次会话撤销过两步

    const history = await loadServerHistory('doc-a', { fetch: createFakeFetch(backend), getRoot })

    expect(history.getHistorySeq()).toBe(1)
    expect(history.redo()).toEqual(makeMoveOp(20))
    expect(history.undo()).toEqual(invertOp(makeMoveOp(20)))
    expect(history.undo()).toEqual(invertOp(makeMoveOp(10)))
    expect(history.undo()).toBeNull()
  })

  it('record 写后端：丢弃本地重放分支、推进 historySeq、POST op', async () => {
    const backend = seedBackend(2)
    const fetchMock = createFakeFetch(backend)
    const history = await loadServerHistory('doc-a', { fetch: fetchMock, getRoot })

    history.undo() // 本地 historySeq 回到 1
    history.record(makeMoveOp(99))
    await history.flush()

    expect(history.getHistorySeq()).toBe(2)
    expect(history.redo()).toBeNull() // 重放分支已丢弃
    expect(history.undo()).toEqual(invertOp(makeMoveOp(99)))
    // 本地撤销过、后端不知道 → 先 PUT 写回 historySeq 再追加，两端 seq 不错位
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/documents/doc-a',
      expect.objectContaining({ method: 'PUT' }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/documents/doc-a/history',
      expect.objectContaining({ method: 'POST' }),
    )
    // 后端日志与本地一致：旧 seq2 被丢弃，新 op 落在 seq2
    expect(backend.entries.map((entry) => entry.seq)).toEqual([1, 2])
    expect(backend.entries[1]?.op).toEqual(makeMoveOp(99))
  })

  it('未撤销过的 record 直接 POST，不多发 PUT', async () => {
    const backend = seedBackend(1)
    const fetchMock = createFakeFetch(backend)
    const history = await loadServerHistory('doc-a', { fetch: fetchMock, getRoot })

    history.record(makeMoveOp(99))
    await history.flush()

    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/documents/doc-a',
      expect.objectContaining({ method: 'PUT' }),
    )
    expect(backend.entries.map((entry) => entry.seq)).toEqual([1, 2])
  })

  it('裁剪窗口外的更早操作不可撤销（返回 null 而不是越界）', async () => {
    const backend = seedBackend(2)
    const history = await loadServerHistory('doc-a', { fetch: createFakeFetch(backend), getRoot })

    history.undo()
    history.undo()
    expect(history.undo()).toBeNull()
    expect(history.getHistorySeq()).toBe(0)
  })

  it('POST 失败时本地状态照走，错误经 onError 上报，flush 不 reject', async () => {
    const backend = seedBackend(1)
    const failingFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonResponse({ error: 'internal_error' }, 500)
      return createFakeFetch(backend)(input, init)
    })
    const onError = vi.fn()
    const history = await loadServerHistory('doc-a', { fetch: failingFetch, getRoot, onError })

    history.record(makeMoveOp(99))
    await history.flush()

    expect(history.getHistorySeq()).toBe(2)
    expect(onError).toHaveBeenCalledOnce()
  })

  it('加载失败（路由非 2xx）时 reject', async () => {
    const failingFetch = vi.fn(async () => jsonResponse({ error: 'document_not_found' }, 404))
    await expect(
      loadServerHistory('missing', { fetch: failingFetch, getRoot }),
    ).rejects.toThrow()
  })
})
