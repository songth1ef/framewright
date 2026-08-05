import type { FrameNode } from '@framewright/core'
import { isCanvasNode, isRecord } from '../../../../components/canvas-document-file'

export { isCanvasNode, isRecord } from '../../../../components/canvas-document-file'

interface StoredDocumentDto {
  id: string
  name: string
  root: FrameNode
  historySeq: number
  createdAt: Date
  updatedAt: Date
}

interface SaveDocumentDto {
  name: string
  root: FrameNode
  historySeq: number
}

interface RenameDocumentDto {
  name: string
}

export interface DocumentRouteService {
  getDocument(documentId: string): Promise<StoredDocumentDto | null>
  saveDocument(documentId: string, input: SaveDocumentDto): Promise<StoredDocumentDto>
  renameDocument(documentId: string, name: string): Promise<StoredDocumentDto>
  deleteDocument(documentId: string): Promise<void>
}

export interface RouteContext {
  params: Promise<{ id: string }>
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status })
}

export function parseDocumentId(value: string): string | null {
  const id = value.trim()
  return id.length > 0 && id.length <= 128 ? id : null
}

type UpdateDocumentDto =
  | { kind: 'rename'; input: RenameDocumentDto }
  | { kind: 'save'; input: SaveDocumentDto }

async function parseUpdateInput(request: Request): Promise<UpdateDocumentDto | null> {
  let value: unknown
  try {
    value = await request.json()
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  const { name, root, historySeq } = value
  if (typeof name === 'string' && name.trim().length > 0 && Object.keys(value).length === 1) {
    return { kind: 'rename', input: { name: name.trim() } }
  }
  if (
    typeof name !== 'string' ||
    name.trim().length === 0 ||
    !isCanvasNode(root) ||
    root.fwType !== 'frame' ||
    !Number.isSafeInteger(historySeq) ||
    (historySeq as number) < 0
  ) {
    return null
  }
  return { kind: 'save', input: { name: name.trim(), root, historySeq: historySeq as number } }
}

function isMissingRecordError(error: unknown): boolean {
  return isRecord(error) && error['code'] === 'P2025'
}

export function createDocumentRouteHandlers(service: DocumentRouteService) {
  return {
    async GET(_request: Request, context: RouteContext): Promise<Response> {
      const documentId = parseDocumentId((await context.params).id)
      if (documentId === null) return jsonError('invalid_document_id', 400)

      try {
        const document = await service.getDocument(documentId)
        return document === null
          ? jsonError('document_not_found', 404)
          : Response.json(document)
      } catch {
        return jsonError('internal_error', 500)
      }
    },

    async PUT(request: Request, context: RouteContext): Promise<Response> {
      const documentId = parseDocumentId((await context.params).id)
      if (documentId === null) return jsonError('invalid_document_id', 400)
      const update = await parseUpdateInput(request)
      if (update === null) return jsonError('invalid_request', 400)

      try {
        const document = update.kind === 'rename'
          ? await service.renameDocument(documentId, update.input.name)
          : await service.saveDocument(documentId, update.input)
        return Response.json(document)
      } catch (error) {
        return isMissingRecordError(error)
          ? jsonError('document_not_found', 404)
          : jsonError('internal_error', 500)
      }
    },

    async DELETE(_request: Request, context: RouteContext): Promise<Response> {
      const documentId = parseDocumentId((await context.params).id)
      if (documentId === null) return jsonError('invalid_document_id', 400)

      try {
        await service.deleteDocument(documentId)
        return new Response(null, { status: 204 })
      } catch (error) {
        return isMissingRecordError(error)
          ? jsonError('document_not_found', 404)
          : jsonError('internal_error', 500)
      }
    },
  }
}
