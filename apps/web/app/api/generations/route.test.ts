import { describe, expect, it, vi } from 'vitest'
import {
  createGenerationsRouteHandlers,
  type GenerationRouteService,
} from './route-handler'

const generation = {
  id: 'generation-a',
  status: 'pending' as const,
  outputAssetIds: [],
  errorMessage: null,
}

function createService(): GenerationRouteService {
  return {
    getDocument: vi.fn(async () => ({ projectId: 'project-a' })),
    submitGeneration: vi.fn(async () => ({ generation, taskId: 'task-a' })),
  }
}

function request(body: string): Request {
  return new Request('http://localhost/api/generations', { method: 'POST', body })
}

describe('POST /api/generations', () => {
  it('按 documentId 解析 projectId，并把合法请求交给 server-core 编排层', async () => {
    const service = createService()
    const { POST } = createGenerationsRouteHandlers(service)

    const response = await POST(
      request(
        JSON.stringify({
          documentId: ' document-a ',
          sessionId: ' session-a ',
          params: {
            kind: 'text-to-image',
            prompt: ' 中立占位提示词 ',
            options: { model: 'mock-model' },
          },
          inputAssetIds: ['asset-a'],
        }),
      ),
    )

    expect(service.getDocument).toHaveBeenCalledWith('document-a')
    expect(service.submitGeneration).toHaveBeenCalledWith({
      projectId: 'project-a',
      documentId: 'document-a',
      sessionId: 'session-a',
      params: {
        kind: 'text-to-image',
        prompt: '中立占位提示词',
        options: { model: 'mock-model' },
      },
      inputAssetIds: ['asset-a'],
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ generation, taskId: 'task-a' })
  })

  it('画布不存在时返回 404，且不提交生成', async () => {
    const service = createService()
    vi.mocked(service.getDocument).mockResolvedValue(null)

    const response = await createGenerationsRouteHandlers(service).POST(
      request(
        JSON.stringify({
          documentId: 'missing',
          params: { kind: 'text-to-image', prompt: 'placeholder' },
        }),
      ),
    )

    expect(response.status).toBe(404)
    expect(service.submitGeneration).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({ error: 'document_not_found' })
  })

  it.each([
    ['损坏 JSON', '{'],
    ['非对象', '[]'],
    ['缺 documentId', JSON.stringify({ params: { kind: 'text-to-image', prompt: 'x' } })],
    ['非法 kind', JSON.stringify({ documentId: 'd', params: { kind: 'unknown', prompt: 'x' } })],
    ['空 prompt', JSON.stringify({ documentId: 'd', params: { kind: 'text-to-image', prompt: ' ' } })],
    ['非法 options', JSON.stringify({ documentId: 'd', params: { kind: 'text-to-image', prompt: 'x', options: [] } })],
    ['非法 sessionId', JSON.stringify({ documentId: 'd', sessionId: 1, params: { kind: 'text-to-image', prompt: 'x' } })],
    ['非法 inputAssetIds', JSON.stringify({ documentId: 'd', params: { kind: 'image-to-image', prompt: 'x' }, inputAssetIds: [' '] })],
  ])('%s 返回 400，且不触发花钱入口', async (_label, body) => {
    const service = createService()

    const response = await createGenerationsRouteHandlers(service).POST(request(body))

    expect(response.status).toBe(400)
    expect(service.getDocument).not.toHaveBeenCalled()
    expect(service.submitGeneration).not.toHaveBeenCalled()
  })

  it('server-core 异常统一映射为 500', async () => {
    const service = createService()
    vi.mocked(service.submitGeneration).mockRejectedValue(new Error('provider offline'))

    const response = await createGenerationsRouteHandlers(service).POST(
      request(
        JSON.stringify({
          documentId: 'document-a',
          params: { kind: 'text-to-video', prompt: 'placeholder' },
        }),
      ),
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'internal_error' })
  })
})
