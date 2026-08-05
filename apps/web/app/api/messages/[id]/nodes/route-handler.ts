import type { StoredMessage } from '@framewright/server-core'
import {
  getErrorCode,
  type IdRouteContext,
  jsonError,
  parseId,
  parseIdList,
  parseJsonRecord,
} from '../../../_shared/route-utils'

export interface MessageNodesRouteService {
  linkNodeFwIds(messageId: string, nodeFwIds: readonly string[]): Promise<StoredMessage | unknown>
}

export function createMessageNodesRouteHandlers(service: MessageNodesRouteService) {
  return {
    async POST(request: Request, context: IdRouteContext): Promise<Response> {
      const messageId = parseId((await context.params).id)
      if (messageId === null) return jsonError('invalid_message_id', 400)
      const value = await parseJsonRecord(request)
      const nodeFwIds = value === null ? null : parseIdList(value['nodeFwIds'])
      if (nodeFwIds === null) return jsonError('invalid_request', 400)
      try {
        return Response.json(await service.linkNodeFwIds(messageId, nodeFwIds))
      } catch (error) {
        return getErrorCode(error) === 'P2025'
          ? jsonError('message_not_found', 404)
          : jsonError('internal_error', 500)
      }
    },
  }
}

