import type { CanvasOp } from '@framewright/core'
import { isCanvasNode, isRecord } from '../../../../../components/canvas-document-file'
import { parseDocumentId } from '../route-handler'

interface HistoryEntryDto {
  id: string
  documentId: string
  seq: number
  op: CanvasOp
  createdAt: Date
}

export interface HistoryRouteService {
  getHistory(documentId: string): Promise<readonly HistoryEntryDto[]>
  appendHistory(documentId: string, op: CanvasOp): Promise<HistoryEntryDto>
}

export interface RouteContext {
  params: Promise<{ id: string }>
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status })
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNodeSlot(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['parentFwId'] === 'string' &&
    Number.isSafeInteger(value['index']) &&
    (value['index'] as number) >= 0 &&
    isFiniteNumber(value['x']) &&
    isFiniteNumber(value['y'])
  )
}

function isInboundRef(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['fwId'] === 'string' &&
    Number.isSafeInteger(value['index']) &&
    (value['index'] as number) >= 0 &&
    typeof value['targetFwId'] === 'string'
  )
}

function isAtomicCanvasOp(value: unknown): boolean {
  if (!isRecord(value)) return false
  switch (value['kind']) {
    case 'add-node':
    case 'remove-node':
      return (
        isNodeSlot(value['slot']) &&
        isCanvasNode(value['node']) &&
        Array.isArray(value['inboundRefs']) &&
        value['inboundRefs'].every(isInboundRef)
      )
    case 'move-node':
      return (
        typeof value['fwId'] === 'string' &&
        isNodeSlot(value['from']) &&
        isNodeSlot(value['to'])
      )
    case 'update-node':
      return (
        typeof value['fwId'] === 'string' &&
        isRecord(value['before']) &&
        isRecord(value['after'])
      )
    default:
      return false
  }
}

function isCanvasOp(value: unknown): value is CanvasOp {
  if (!isRecord(value)) return false
  if (value['kind'] !== 'batch') return isAtomicCanvasOp(value)
  return (
    Array.isArray(value['ops']) &&
    value['ops'].length > 0 &&
    value['ops'].every(isAtomicCanvasOp)
  )
}

async function parseAppendInput(request: Request): Promise<CanvasOp | null> {
  let value: unknown
  try {
    value = await request.json()
  } catch {
    return null
  }
  return isRecord(value) && isCanvasOp(value['op']) ? value['op'] : null
}

function getErrorCode(error: unknown): unknown {
  return isRecord(error) ? error['code'] : undefined
}

export function createHistoryRouteHandlers(service: HistoryRouteService) {
  return {
    async GET(_request: Request, context: RouteContext): Promise<Response> {
      const documentId = parseDocumentId((await context.params).id)
      if (documentId === null) return jsonError('invalid_document_id', 400)
      try {
        return Response.json(await service.getHistory(documentId))
      } catch (error) {
        return getErrorCode(error) === 'P2025'
          ? jsonError('document_not_found', 404)
          : jsonError('internal_error', 500)
      }
    },

    async POST(request: Request, context: RouteContext): Promise<Response> {
      const documentId = parseDocumentId((await context.params).id)
      if (documentId === null) return jsonError('invalid_document_id', 400)
      const op = await parseAppendInput(request)
      if (op === null) return jsonError('invalid_request', 400)

      try {
        return Response.json(await service.appendHistory(documentId, op), { status: 201 })
      } catch (error) {
        const code = getErrorCode(error)
        if (code === 'P2025') return jsonError('document_not_found', 404)
        if (code === 'P2002') return jsonError('history_conflict', 409)
        return jsonError('internal_error', 500)
      }
    },
  }
}
