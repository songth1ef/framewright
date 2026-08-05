import {
  getErrorCode,
  type IdRouteContext,
  jsonError,
  parseId,
  parseJsonRecord,
  parseRequiredText,
} from '../../_shared/route-utils'

interface StoredSessionDto {
  id: string
  projectId: string
  title: string
  createdAt: Date
  updatedAt: Date
}

export interface SessionRouteService {
  getSession(sessionId: string): Promise<StoredSessionDto | null>
  renameSession(sessionId: string, title: string): Promise<StoredSessionDto>
  deleteSession(sessionId: string): Promise<void>
}

export function createSessionRouteHandlers(service: SessionRouteService) {
  const parseSessionId = async (context: IdRouteContext) => parseId((await context.params).id)
  const missingOrInternal = (error: unknown) => getErrorCode(error) === 'P2025'
    ? jsonError('session_not_found', 404)
    : jsonError('internal_error', 500)

  return {
    async GET(_request: Request, context: IdRouteContext): Promise<Response> {
      const sessionId = await parseSessionId(context)
      if (sessionId === null) return jsonError('invalid_session_id', 400)
      try {
        const session = await service.getSession(sessionId)
        return session === null ? jsonError('session_not_found', 404) : Response.json(session)
      } catch {
        return jsonError('internal_error', 500)
      }
    },
    async PATCH(request: Request, context: IdRouteContext): Promise<Response> {
      const sessionId = await parseSessionId(context)
      if (sessionId === null) return jsonError('invalid_session_id', 400)
      const value = await parseJsonRecord(request)
      const title = value === null ? null : parseRequiredText(value['title'])
      if (title === null) return jsonError('invalid_request', 400)
      try {
        return Response.json(await service.renameSession(sessionId, title))
      } catch (error) {
        return missingOrInternal(error)
      }
    },
    async DELETE(_request: Request, context: IdRouteContext): Promise<Response> {
      const sessionId = await parseSessionId(context)
      if (sessionId === null) return jsonError('invalid_session_id', 400)
      try {
        await service.deleteSession(sessionId)
        return new Response(null, { status: 204 })
      } catch (error) {
        return missingOrInternal(error)
      }
    },
  }
}

