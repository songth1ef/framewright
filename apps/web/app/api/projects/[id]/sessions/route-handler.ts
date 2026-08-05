import {
  getErrorCode,
  type IdRouteContext,
  jsonError,
  parseId,
  parseJsonRecord,
  parseRequiredText,
} from '../../../_shared/route-utils'

interface StoredSessionDto {
  id: string
  projectId: string
  title: string
  createdAt: Date
  updatedAt: Date
}

export interface ProjectSessionsRouteService {
  listProjectSessions(projectId: string): Promise<readonly StoredSessionDto[]>
  createSession(input: { projectId: string; title: string }): Promise<StoredSessionDto>
}

export function createProjectSessionsRouteHandlers(service: ProjectSessionsRouteService) {
  return {
    async GET(_request: Request, context: IdRouteContext): Promise<Response> {
      const projectId = parseId((await context.params).id)
      if (projectId === null) return jsonError('invalid_project_id', 400)
      try {
        return Response.json(await service.listProjectSessions(projectId))
      } catch {
        return jsonError('internal_error', 500)
      }
    },
    async POST(request: Request, context: IdRouteContext): Promise<Response> {
      const projectId = parseId((await context.params).id)
      if (projectId === null) return jsonError('invalid_project_id', 400)
      const value = await parseJsonRecord(request)
      const title = value === null ? null : parseRequiredText(value['title'])
      if (title === null) return jsonError('invalid_request', 400)
      try {
        return Response.json(await service.createSession({ projectId, title }), { status: 201 })
      } catch (error) {
        return getErrorCode(error) === 'P2003'
          ? jsonError('project_not_found', 404)
          : jsonError('internal_error', 500)
      }
    },
  }
}

