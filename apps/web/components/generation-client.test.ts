import { describe, expect, it } from 'vitest'
import { createHttpGenerationBackend } from './generation-client'

interface RecordedCall {
  url: string
  method: string
  body: unknown
}

function makeFetch(responses: Array<{ ok: boolean; status: number; json: unknown }>) {
  const calls: RecordedCall[] = []
  let index = 0
  const fetchImpl = async (input: unknown, init?: { method?: string; body?: string }) => {
    const response = responses[Math.min(index, responses.length - 1)]!
    index += 1
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: init?.body === undefined ? undefined : JSON.parse(init.body),
    })
    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.json,
    } as Response
  }
  return { calls, fetchImpl: fetchImpl as typeof fetch }
}

describe('createHttpGenerationBackend', () => {
  it('submit 走 POST /api/generations，body 原样透传提交参数', async () => {
    const { calls, fetchImpl } = makeFetch([
      {
        ok: true,
        status: 200,
        json: { generation: { id: 'gen-1', status: 'pending', outputAssetIds: [], errorMessage: null }, taskId: 'task-1' },
      },
    ])
    const backend = createHttpGenerationBackend(fetchImpl)
    const request = {
      documentId: 'doc-1',
      params: { kind: 'text-to-image' as const, prompt: '一只猫', options: { model: 'm' } },
    }
    const result = await backend.submit(request)
    expect(calls).toEqual([{ url: '/api/generations', method: 'POST', body: request }])
    expect(result.generation.id).toBe('gen-1')
    expect(result.taskId).toBe('task-1')
  })

  it('poll 走 POST /api/generations/[id]/poll，携带 taskId；id 被转义', async () => {
    const { calls, fetchImpl } = makeFetch([
      { ok: true, status: 200, json: { id: 'gen/1', status: 'running', outputAssetIds: [], errorMessage: null } },
    ])
    const backend = createHttpGenerationBackend(fetchImpl)
    await backend.poll('gen/1', 'task-1')
    expect(calls).toEqual([
      { url: '/api/generations/gen%2F1/poll', method: 'POST', body: { taskId: 'task-1' } },
    ])
  })

  it('poll 可省略 taskId（同进程内路由侧有内存映射）', async () => {
    const { calls, fetchImpl } = makeFetch([
      { ok: true, status: 200, json: { id: 'gen-1', status: 'running', outputAssetIds: [], errorMessage: null } },
    ])
    const backend = createHttpGenerationBackend(fetchImpl)
    await backend.poll('gen-1')
    expect(calls[0]?.body).toEqual({})
  })

  it('HTTP 非 ok 抛带状态码的错误', async () => {
    const { fetchImpl } = makeFetch([{ ok: false, status: 404, json: {} }])
    const backend = createHttpGenerationBackend(fetchImpl)
    await expect(
      backend.submit({ documentId: 'doc-1', params: { kind: 'text-to-image', prompt: 'x' } }),
    ).rejects.toThrow('404')
  })
})
