import { encodeJsonBody } from '@framewright/core'
import { clearStoredViewport } from './viewport-storage'

export interface DocumentSummary {
  id: string
  name: string
  updatedAt?: string
}

async function requireOk(response: Response): Promise<Response> {
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response
}

export async function loadDocumentSummaries(): Promise<DocumentSummary[]> {
  const response = await requireOk(await fetch('/api/documents'))
  return response.json() as Promise<DocumentSummary[]>
}

export async function createCanvasDocument(name: string, root: unknown): Promise<DocumentSummary> {
  // 大画布必须压缩后再传：Vercel serverless 请求体上限 4.5MB（十进制），
  // 而 10000 节点的负载是 4,554,794 字节 —— 超 1.2%，线上必然 413，本地却毫无问题。
  // 见 packages/core/src/compressed-json.ts 的完整实测数据。
  const encoded = await encodeJsonBody({ name, root })
  const response = await requireOk(await fetch('/api/documents', {
    method: 'POST',
    headers: encoded.headers,
    body: encoded.body,
  }))
  return response.json() as Promise<DocumentSummary>
}

export async function renameCanvasDocument(documentId: string, name: string): Promise<DocumentSummary> {
  const path = `/api/documents/${encodeURIComponent(documentId)}`
  const putResponse = await requireOk(await fetch(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  }))
  return putResponse.json() as Promise<DocumentSummary>
}

export async function deleteCanvasDocument(documentId: string): Promise<void> {
  await requireOk(await fetch(`/api/documents/${encodeURIComponent(documentId)}`, {
    method: 'DELETE',
  }))
  clearStoredViewport(documentId)
}

export function formatUpdatedAt(updatedAt: string | undefined): string {
  if (updatedAt === undefined) return '加载中…'
  const date = new Date(updatedAt)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
