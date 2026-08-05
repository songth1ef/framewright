import type { StoredAsset, UploadAssetInput } from '@framewright/server-core'
import {
  getErrorCode,
  type IdRouteContext,
  jsonError,
  parseId,
} from '../../../_shared/route-utils'

export interface ProjectAssetsRouteService {
  listProjectAssets(projectId: string): Promise<readonly StoredAsset[]>
  uploadAsset(input: UploadAssetInput): Promise<StoredAsset>
}

function parseOptionalInteger(value: FormDataEntryValue | null): number | null | undefined {
  if (value === null) return undefined
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : null
}

async function parseUploadInput(
  request: Request,
  projectId: string,
): Promise<UploadAssetInput | null> {
  let value: FormData
  try {
    value = await request.formData()
  } catch {
    return null
  }
  const file = value.get('file')
  const kind = value.get('kind')
  if (
    !(file instanceof File) ||
    (kind !== 'image' && kind !== 'video' && kind !== 'audio') ||
    !file.type.startsWith(`${kind}/`)
  ) {
    return null
  }
  const width = parseOptionalInteger(value.get('width'))
  const height = parseOptionalInteger(value.get('height'))
  const durationMs = parseOptionalInteger(value.get('durationMs'))
  if (width === null || height === null || durationMs === null) return null
  return {
    projectId,
    kind,
    mimeType: file.type,
    data: new Uint8Array(await file.arrayBuffer()),
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(durationMs === undefined ? {} : { durationMs }),
  }
}

export function createProjectAssetsRouteHandlers(service: ProjectAssetsRouteService) {
  return {
    async GET(_request: Request, context: IdRouteContext): Promise<Response> {
      const projectId = parseId((await context.params).id)
      if (projectId === null) return jsonError('invalid_project_id', 400)
      try {
        return Response.json(await service.listProjectAssets(projectId))
      } catch {
        return jsonError('internal_error', 500)
      }
    },

    async POST(request: Request, context: IdRouteContext): Promise<Response> {
      const projectId = parseId((await context.params).id)
      if (projectId === null) return jsonError('invalid_project_id', 400)
      const input = await parseUploadInput(request, projectId)
      if (input === null) return jsonError('invalid_request', 400)
      try {
        return Response.json(await service.uploadAsset(input), { status: 201 })
      } catch (error) {
        return getErrorCode(error) === 'P2003'
          ? jsonError('project_not_found', 404)
          : jsonError('internal_error', 500)
      }
    },
  }
}
