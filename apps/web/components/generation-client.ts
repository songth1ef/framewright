import type {
  GenerationBackend,
  GenerationDto,
  SubmitGenerationRequest,
  SubmittedGenerationDto,
} from './generation-flow'

/**
 * G2-3：`GenerationBackend` 的 HTTP 实现。
 *
 * 契约镜像 server-core 编排层（commit 0825a71）的函数签名：
 * - `POST /api/generations`           ↔ `submitGeneration(input)` → `{ generation, taskId }`
 * - `POST /api/generations/[id]/poll` ↔ `pollGeneration(generationId, taskId?)` → `generation`
 *
 * 路由侧只许组装依赖后调编排层；这里不写任何业务逻辑，只做透传与错误包装。
 */

const JSON_HEADERS = { 'content-type': 'application/json' }

async function postJson<T>(fetchImpl: typeof fetch, url: string, body: unknown): Promise<T> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`生成请求失败：HTTP ${response.status}（${url}）`)
  return (await response.json()) as T
}

export function createHttpGenerationBackend(fetchImpl: typeof fetch = fetch): GenerationBackend {
  return {
    submit(request: SubmitGenerationRequest): Promise<SubmittedGenerationDto> {
      return postJson(fetchImpl, '/api/generations', request)
    },
    poll(generationId: string, taskId?: string): Promise<GenerationDto> {
      return postJson(
        fetchImpl,
        `/api/generations/${encodeURIComponent(generationId)}/poll`,
        taskId === undefined ? {} : { taskId },
      )
    },
  }
}
