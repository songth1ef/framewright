import {
  type IdRouteContext,
  isRecord,
  jsonError,
  parseId,
  parseIdList,
  parseJsonRecord,
  parseRequiredText,
} from '../_shared/route-utils'

const GENERATION_KINDS = [
  'text-to-image',
  'image-to-image',
  'text-to-video',
  'image-to-video',
] as const

type GenerationKind = (typeof GENERATION_KINDS)[number]

interface GenerationParamsDto {
  kind: GenerationKind
  prompt: string
  options?: Record<string, unknown>
}

interface SubmitGenerationDto {
  projectId: string
  documentId: string
  sessionId?: string
  params: GenerationParamsDto
  inputAssetIds?: readonly string[]
}

interface GenerationDto {
  id: string
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  outputAssetIds: readonly string[]
  errorMessage: string | null
}

export interface GenerationRouteService {
  getDocument(documentId: string): Promise<{ projectId: string } | null>
  submitGeneration(input: SubmitGenerationDto): Promise<{
    generation: GenerationDto
    taskId: string
  }>
}

export interface GenerationPollRouteService {
  pollGeneration(generationId: string, taskId?: string): Promise<GenerationDto>
}

interface ParsedSubmitRequest {
  documentId: string
  sessionId?: string
  params: GenerationParamsDto
  inputAssetIds?: readonly string[]
}

function isGenerationKind(value: unknown): value is GenerationKind {
  return typeof value === 'string' && GENERATION_KINDS.includes(value as GenerationKind)
}

function hasErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error['code'] === code
}

function parseParams(value: unknown): GenerationParamsDto | null {
  if (!isRecord(value) || !isGenerationKind(value['kind'])) return null
  const prompt = parseRequiredText(value['prompt'])
  if (prompt === null) return null
  if (value['options'] === undefined) return { kind: value['kind'], prompt }
  return isRecord(value['options'])
    ? { kind: value['kind'], prompt, options: value['options'] }
    : null
}

async function parseSubmitRequest(request: Request): Promise<ParsedSubmitRequest | null> {
  const value = await parseJsonRecord(request)
  if (value === null || typeof value['documentId'] !== 'string') return null
  const documentId = parseId(value['documentId'])
  const params = parseParams(value['params'])
  if (documentId === null || params === null) return null

  const sessionId =
    value['sessionId'] === undefined
      ? undefined
      : typeof value['sessionId'] === 'string'
        ? parseId(value['sessionId'])
        : null
  if (sessionId === null) return null

  const inputAssetIds =
    value['inputAssetIds'] === undefined ? undefined : parseIdList(value['inputAssetIds'], true)
  if (inputAssetIds === null) return null

  return {
    documentId,
    ...(sessionId === undefined ? {} : { sessionId }),
    params,
    ...(inputAssetIds === undefined ? {} : { inputAssetIds }),
  }
}

async function parsePollTaskId(request: Request): Promise<string | undefined | null> {
  const value = await parseJsonRecord(request)
  if (value === null || Object.keys(value).some((key) => key !== 'taskId')) return null
  if (value['taskId'] === undefined) return undefined
  return typeof value['taskId'] === 'string' ? parseId(value['taskId']) : null
}

export function createGenerationsRouteHandlers(service: GenerationRouteService) {
  return {
    async POST(request: Request): Promise<Response> {
      const input = await parseSubmitRequest(request)
      if (input === null) return jsonError('invalid_request', 400)

      try {
        const document = await service.getDocument(input.documentId)
        if (document === null) return jsonError('document_not_found', 404)
        return Response.json(
          await service.submitGeneration({
            projectId: document.projectId,
            ...input,
          }),
        )
      } catch {
        return jsonError('internal_error', 500)
      }
    },
  }
}

export function createGenerationPollRouteHandlers(service: GenerationPollRouteService) {
  return {
    async POST(request: Request, context: IdRouteContext): Promise<Response> {
      const generationId = parseId((await context.params).id)
      if (generationId === null) return jsonError('invalid_generation_id', 400)
      const taskId = await parsePollTaskId(request)
      if (taskId === null) return jsonError('invalid_request', 400)

      try {
        return Response.json(await service.pollGeneration(generationId, taskId))
      } catch (error) {
        if (hasErrorCode(error, 'unknown-generation')) {
          return jsonError('generation_not_found', 404)
        }
        return jsonError('internal_error', 500)
      }
    },
  }
}
