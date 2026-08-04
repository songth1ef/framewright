import { SHAPE_TYPES, type CanvasNode, type FrameNode } from '@framewright/core'

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

export interface DocumentRouteService {
  getDocument(documentId: string): Promise<StoredDocumentDto | null>
  saveDocument(documentId: string, input: SaveDocumentDto): Promise<StoredDocumentDto>
}

export interface RouteContext {
  params: Promise<{ id: string }>
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status })
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasBaseNodeFields(value: Record<string, unknown>): boolean {
  return (
    typeof value['fwId'] === 'string' &&
    typeof value['name'] === 'string' &&
    typeof value['x'] === 'number' &&
    Number.isFinite(value['x']) &&
    typeof value['y'] === 'number' &&
    Number.isFinite(value['y']) &&
    typeof value['width'] === 'number' &&
    Number.isFinite(value['width']) &&
    value['width'] >= 0 &&
    typeof value['height'] === 'number' &&
    Number.isFinite(value['height']) &&
    value['height'] >= 0 &&
    typeof value['rotation'] === 'number' &&
    Number.isFinite(value['rotation']) &&
    typeof value['opacity'] === 'number' &&
    value['opacity'] >= 0 &&
    value['opacity'] <= 1 &&
    typeof value['visible'] === 'boolean' &&
    typeof value['locked'] === 'boolean'
  )
}

export function isCanvasNode(value: unknown): value is CanvasNode {
  if (!isRecord(value) || !hasBaseNodeFields(value)) return false
  const fwType = value['fwType']
  if (typeof fwType !== 'string' || !SHAPE_TYPES.includes(fwType as CanvasNode['fwType'])) {
    return false
  }

  switch (fwType) {
    case 'frame':
      return (
        typeof value['clip'] === 'boolean' &&
        (value['background'] === null || typeof value['background'] === 'string') &&
        Array.isArray(value['children']) &&
        value['children'].every(isCanvasNode)
      )
    case 'box':
      return typeof value['fill'] === 'string' && typeof value['cornerRadius'] === 'number'
    case 'img':
      return typeof value['src'] === 'string' && isObjectFit(value['fit'])
    case 'video':
      return (
        typeof value['src'] === 'string' &&
        (value['poster'] === null || typeof value['poster'] === 'string') &&
        isObjectFit(value['fit'])
      )
    case 'ai-image':
      return hasGenerationFields(value) && isObjectFit(value['fit'])
    case 'ai-video':
      return (
        hasGenerationFields(value) &&
        (value['poster'] === null || typeof value['poster'] === 'string') &&
        isObjectFit(value['fit'])
      )
    default:
      return false
  }
}

function isObjectFit(value: unknown): boolean {
  return value === 'contain' || value === 'cover' || value === 'fill'
}

function hasGenerationFields(value: Record<string, unknown>): boolean {
  return (
    (value['generationId'] === null || typeof value['generationId'] === 'string') &&
    ['empty', 'pending', 'running', 'succeeded', 'failed'].includes(String(value['status'])) &&
    (value['errorMessage'] === null || typeof value['errorMessage'] === 'string') &&
    typeof value['prompt'] === 'string' &&
    isRecord(value['params']) &&
    (value['src'] === null || typeof value['src'] === 'string') &&
    Array.isArray(value['sourceFwIds']) &&
    value['sourceFwIds'].every((item) => typeof item === 'string')
  )
}

export function parseDocumentId(value: string): string | null {
  const id = value.trim()
  return id.length > 0 && id.length <= 128 ? id : null
}

async function parseSaveInput(request: Request): Promise<SaveDocumentDto | null> {
  let value: unknown
  try {
    value = await request.json()
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  const { name, root, historySeq } = value
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
  return { name: name.trim(), root, historySeq: historySeq as number }
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
      const input = await parseSaveInput(request)
      if (input === null) return jsonError('invalid_request', 400)

      try {
        return Response.json(await service.saveDocument(documentId, input))
      } catch (error) {
        return isMissingRecordError(error)
          ? jsonError('document_not_found', 404)
          : jsonError('internal_error', 500)
      }
    },
  }
}
