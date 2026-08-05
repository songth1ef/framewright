import {
  getErrorCode,
  type IdRouteContext,
  jsonError,
  parseId,
  parseJsonRecord,
  parseNullableId,
  parseNullableText,
  parseRequiredText,
} from '../../_shared/route-utils'

interface StoredProjectDto {
  id: string
  name: string
  description: string | null
  coverAssetId: string | null
  createdAt: Date
  updatedAt: Date
}

interface UpdateProjectDto {
  name?: string
  description?: string | null
  coverAssetId?: string | null
}

export interface ProjectRouteService {
  getProject(projectId: string): Promise<StoredProjectDto | null>
  updateProject(projectId: string, input: UpdateProjectDto): Promise<StoredProjectDto>
}

async function parseUpdateInput(request: Request): Promise<UpdateProjectDto | null> {
  const value = await parseJsonRecord(request)
  if (value === null) return null
  const input: UpdateProjectDto = {}
  if (value['name'] !== undefined) {
    const name = parseRequiredText(value['name'])
    if (name === null) return null
    input.name = name
  }
  if (value['description'] !== undefined) {
    const description = parseNullableText(value['description'])
    if (description === undefined) return null
    input.description = description
  }
  if (value['coverAssetId'] !== undefined) {
    const coverAssetId = parseNullableId(value['coverAssetId'])
    if (coverAssetId === undefined) return null
    input.coverAssetId = coverAssetId
  }
  return Object.keys(input).length > 0 ? input : null
}

export function createProjectRouteHandlers(service: ProjectRouteService) {
  return {
    async GET(_request: Request, context: IdRouteContext): Promise<Response> {
      const projectId = parseId((await context.params).id)
      if (projectId === null) return jsonError('invalid_project_id', 400)
      try {
        const project = await service.getProject(projectId)
        return project === null ? jsonError('project_not_found', 404) : Response.json(project)
      } catch {
        return jsonError('internal_error', 500)
      }
    },
    async PATCH(request: Request, context: IdRouteContext): Promise<Response> {
      const projectId = parseId((await context.params).id)
      if (projectId === null) return jsonError('invalid_project_id', 400)
      const input = await parseUpdateInput(request)
      if (input === null) return jsonError('invalid_request', 400)
      try {
        return Response.json(await service.updateProject(projectId, input))
      } catch (error) {
        return getErrorCode(error) === 'P2025'
          ? jsonError('project_not_found', 404)
          : jsonError('internal_error', 500)
      }
    },
  }
}

