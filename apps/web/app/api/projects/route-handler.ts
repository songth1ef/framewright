import { jsonError, parseJsonRecord, parseNullableText, parseRequiredText } from '../_shared/route-utils'

interface StoredProjectDto {
  id: string
  name: string
  description: string | null
  coverAssetId: string | null
  createdAt: Date
  updatedAt: Date
}

interface CreateProjectDto {
  name: string
  description?: string
}

export interface ProjectsRouteService {
  listProjects(): Promise<readonly StoredProjectDto[]>
  createProject(input: CreateProjectDto): Promise<StoredProjectDto>
}

async function parseCreateInput(request: Request): Promise<CreateProjectDto | null> {
  const value = await parseJsonRecord(request)
  if (value === null) return null
  const name = parseRequiredText(value['name'])
  if (name === null) return null
  if (value['description'] === undefined) return { name }
  const description = parseNullableText(value['description'])
  return typeof description === 'string' ? { name, description } : null
}

export function createProjectsRouteHandlers(service: ProjectsRouteService) {
  return {
    async GET(): Promise<Response> {
      try {
        return Response.json(await service.listProjects())
      } catch {
        return jsonError('internal_error', 500)
      }
    },
    async POST(request: Request): Promise<Response> {
      const input = await parseCreateInput(request)
      if (input === null) return jsonError('invalid_request', 400)
      try {
        return Response.json(await service.createProject(input), { status: 201 })
      } catch {
        return jsonError('internal_error', 500)
      }
    },
  }
}

