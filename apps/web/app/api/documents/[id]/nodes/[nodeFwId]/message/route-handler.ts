import type { StoredMessage } from '@framewright/server-core'
import { jsonError, parseId } from '../../../../../_shared/route-utils'

export interface NodeMessageRouteContext {
  params: Promise<{ id: string; nodeFwId: string }>
}

export interface NodeMessageRouteService {
  findMessageByNodeFwId(documentId: string, nodeFwId: string): Promise<StoredMessage | unknown | null>
}

export function createNodeMessageRouteHandlers(service: NodeMessageRouteService) {
  return {
    async GET(_request: Request, context: NodeMessageRouteContext): Promise<Response> {
      const params = await context.params
      const documentId = parseId(params.id)
      const nodeFwId = parseId(params.nodeFwId)
      if (documentId === null) return jsonError('invalid_document_id', 400)
      if (nodeFwId === null) return jsonError('invalid_node_fw_id', 400)
      try {
        const message = await service.findMessageByNodeFwId(documentId, nodeFwId)
        return message === null ? jsonError('message_not_found', 404) : Response.json(message)
      } catch {
        return jsonError('internal_error', 500)
      }
    },
  }
}

