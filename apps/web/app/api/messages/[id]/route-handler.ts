import type { StoredMessage } from '@framewright/server-core'
import { type IdRouteContext, jsonError, parseId } from '../../_shared/route-utils'

export interface MessageRouteService {
  getMessage(messageId: string): Promise<StoredMessage | null>
}

export function createMessageRouteHandlers(service: MessageRouteService) {
  return {
    async GET(_request: Request, context: IdRouteContext): Promise<Response> {
      const messageId = parseId((await context.params).id)
      if (messageId === null) return jsonError('invalid_message_id', 400)
      try {
        const message = await service.getMessage(messageId)
        return message === null ? jsonError('message_not_found', 404) : Response.json(message)
      } catch {
        return jsonError('internal_error', 500)
      }
    },
  }
}

