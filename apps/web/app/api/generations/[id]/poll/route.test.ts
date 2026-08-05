import { describe, expect, it, vi } from 'vitest'
import {
  createGenerationPollRouteHandlers,
  type GenerationPollRouteService,
} from '../../route-handler'

const generation = {
  id: 'generation-a',
  status: 'running' as const,
  outputAssetIds: [],
  errorMessage: null,
}

function createService(): GenerationPollRouteService {
  return {
    pollGeneration: vi.fn(async () => generation),
  }
}

const context = (id: string) => ({ params: Promise.resolve({ id }) })

function request(body: string): Request {
  return new Request('http://localhost/api/generations/generation-a/poll', {
    method: 'POST',
    body,
  })
}

describe('POST /api/generations/[id]/poll', () => {
  it('只轮询指定生成任务，绝不从轮询路径提交新生成', async () => {
    const service = createService()

    const response = await createGenerationPollRouteHandlers(service).POST(
      request(JSON.stringify({ taskId: ' task-a ' })),
      context(' generation-a '),
    )

    expect(service.pollGeneration).toHaveBeenCalledWith('generation-a', 'task-a')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(generation)
    expect('submitGeneration' in service).toBe(false)
  })

  it('允许省略 taskId', async () => {
    const service = createService()

    const response = await createGenerationPollRouteHandlers(service).POST(
      request('{}'),
      context('generation-a'),
    )

    expect(service.pollGeneration).toHaveBeenCalledWith('generation-a', undefined)
    expect(response.status).toBe(200)
  })

  it.each([
    ['空 generation id', '{}', ' '],
    ['损坏 JSON', '{', 'generation-a'],
    ['非对象', '[]', 'generation-a'],
    ['非法 taskId', JSON.stringify({ taskId: 1 }), 'generation-a'],
    ['空 taskId', JSON.stringify({ taskId: ' ' }), 'generation-a'],
    ['多余字段', JSON.stringify({ retry: true }), 'generation-a'],
  ])('%s 返回 400，且不调用编排层', async (_label, body, generationId) => {
    const service = createService()

    const response = await createGenerationPollRouteHandlers(service).POST(
      request(body),
      context(generationId),
    )

    expect(response.status).toBe(400)
    expect(service.pollGeneration).not.toHaveBeenCalled()
  })

  it('server-core 异常统一映射为 500', async () => {
    const service = createService()
    vi.mocked(service.pollGeneration).mockRejectedValue(new Error('unknown generation'))

    const response = await createGenerationPollRouteHandlers(service).POST(
      request('{}'),
      context('missing'),
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'internal_error' })
  })
})
