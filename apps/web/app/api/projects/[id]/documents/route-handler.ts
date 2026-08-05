import type { FrameNode } from '@framewright/core'
import { type IdRouteContext, jsonError, parseId } from '../../../_shared/route-utils'

interface StoredDocumentDto {
  id: string
  projectId: string
  name: string
  root: FrameNode
  historySeq: number
  createdAt: Date
  updatedAt: Date
}

export interface ProjectDocumentsRouteService {
  listProjectDocuments(projectId: string): Promise<readonly StoredDocumentDto[]>
}

export function createProjectDocumentsRouteHandlers(service: ProjectDocumentsRouteService) {
  return {
    async GET(_request: Request, context: IdRouteContext): Promise<Response> {
      const projectId = parseId((await context.params).id)
      if (projectId === null) return jsonError('invalid_project_id', 400)
      try {
        return Response.json(await service.listProjectDocuments(projectId))
      } catch {
        return jsonError('internal_error', 500)
      }
    },
  }
}

