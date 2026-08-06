import type { FrameNode } from '@framewright/core'
import { decodeJsonBody } from '@framewright/core'
import { isCanvasNode, isRecord } from './[id]/route-handler'

interface StoredDocumentDto {
  id: string
  name: string
  root: FrameNode
  historySeq: number
  createdAt: Date
  updatedAt: Date
}

interface CreateDocumentDto {
  name: string
  root: FrameNode
}

export interface DocumentsRouteService {
  listDocuments(): Promise<readonly StoredDocumentDto[]>
  createDocument(input: CreateDocumentDto): Promise<StoredDocumentDto>
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status })
}

async function parseCreateInput(request: Request): Promise<CreateDocumentDto | null> {
  let value: unknown
  try {
    // 大画布走 gzip：Node 的 fetch 只自动解压**响应**体，请求体必须显式处理。
    // 未压缩的请求走原路径，行为不变。见 packages/core/src/compressed-json.ts。
    value = await decodeJsonBody(request)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  const { name, root } = value
  if (
    typeof name !== 'string' ||
    name.trim().length === 0 ||
    !isCanvasNode(root) ||
    root.fwType !== 'frame'
  ) {
    return null
  }
  return { name: name.trim(), root }
}

export function createDocumentsRouteHandlers(service: DocumentsRouteService) {
  return {
    async GET(): Promise<Response> {
      try {
        return Response.json(await service.listDocuments())
      } catch {
        return jsonError('internal_error', 500)
      }
    },

    async POST(request: Request): Promise<Response> {
      const input = await parseCreateInput(request)
      if (input === null) return jsonError('invalid_request', 400)
      try {
        return Response.json(await service.createDocument(input), { status: 201 })
      } catch {
        return jsonError('internal_error', 500)
      }
    },
  }
}
