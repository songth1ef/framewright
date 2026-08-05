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
  const response = await requireOk(await fetch('/api/documents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, root }),
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
