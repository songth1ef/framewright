import type { StoredMessage } from '@framewright/server-core'
import {
  getErrorCode,
  type IdRouteContext,
  jsonError,
  parseId,
  parseIdList,
  parseJsonRecord,
} from '../../../_shared/route-utils'

export interface MessageGenerationsRouteService {
  linkGenerations(messageId: string, generationIds: readonly string[]): Promise<StoredMessage | unknown>
}

export function createMessageGenerationsRouteHandlers(service: MessageGenerationsRouteService) {
  return {
    async POST(request: Request, context: IdRouteContext): Promise<Response> {
      const messageId = parseId((await context.params).id)
      if (messageId === null) return jsonError('invalid_message_id', 400)
      const value = await parseJsonRecord(request)
      const generationIds = value === null ? null : parseIdList(value['generationIds'])
      if (generationIds === null) return jsonError('invalid_request', 400)
      try {
        return Response.json(await service.linkGenerations(messageId, generationIds))
      } catch (error) {
        return getErrorCode(error) === 'P2025'
          ? jsonError('message_not_found', 404)
          : jsonError('internal_error', 500)
      }
    },
  }
}

