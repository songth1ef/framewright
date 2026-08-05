import type { AppendMessageInput, MessageRole, StoredMessage } from '@framewright/server-core'
import {
  getErrorCode,
  type IdRouteContext,
  jsonError,
  parseId,
  parseIdList,
  parseJsonRecord,
  parseRequiredText,
} from '../../../_shared/route-utils'

export interface SessionMessagesRouteService {
  listMessages(sessionId: string): Promise<readonly StoredMessage[]>
  appendMessage(sessionId: string, input: AppendMessageInput): Promise<StoredMessage>
}

function isMessageRole(value: unknown): value is MessageRole {
  return value === 'user' || value === 'assistant' || value === 'system'
}

async function parseAppendInput(request: Request): Promise<AppendMessageInput | null> {
  const value = await parseJsonRecord(request)
  if (value === null || !isMessageRole(value['role'])) return null
  const content = parseRequiredText(value['content'])
  if (content === null) return null
  const input: AppendMessageInput = { role: value['role'], content }
  for (const key of ['generationIds', 'nodeFwIds'] as const) {
    if (value[key] === undefined) continue
    const ids = parseIdList(value[key], true)
    if (ids === null) return null
    input[key] = ids
  }
  if (value['documentId'] !== undefined) {
    if (typeof value['documentId'] !== 'string') return null
    const documentId = parseId(value['documentId'])
    if (documentId === null) return null
    input.documentId = documentId
  }
  return input
}

export function createSessionMessagesRouteHandlers(service: SessionMessagesRouteService) {
  const missingOrInternal = (error: unknown) => getErrorCode(error) === 'P2025'
    ? jsonError('session_not_found', 404)
    : jsonError('internal_error', 500)

  return {
    async GET(_request: Request, context: IdRouteContext): Promise<Response> {
      const sessionId = parseId((await context.params).id)
      if (sessionId === null) return jsonError('invalid_session_id', 400)
      try {
        return Response.json(await service.listMessages(sessionId))
      } catch (error) {
        return missingOrInternal(error)
      }
    },
    async POST(request: Request, context: IdRouteContext): Promise<Response> {
      const sessionId = parseId((await context.params).id)
      if (sessionId === null) return jsonError('invalid_session_id', 400)
      const input = await parseAppendInput(request)
      if (input === null) return jsonError('invalid_request', 400)
      try {
        return Response.json(await service.appendMessage(sessionId, input), { status: 201 })
      } catch (error) {
        return missingOrInternal(error)
      }
    },
  }
}
