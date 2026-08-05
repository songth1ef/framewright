import type { Generation as PrismaGeneration, Prisma, PrismaClient } from '@prisma/client'
import { prisma } from './prisma'

/**
 * Generation 记录的存取（`docs/backend-domain.md` §5）。
 *
 * 这张表是回溯枢纽：同时连着对话（messageId）、画布（documentId）、
 * 素材（inputAssetIds / outputAssetIds）。本模块只管记录本身；
 * 「提交任务 → 轮询 → 落素材 → 回填」的编排见 `generation-service.ts`。
 */

export type GenerationStatus = 'pending' | 'running' | 'succeeded' | 'failed'
export type GenerationKind =
  | 'text-to-image'
  | 'image-to-image'
  | 'text-to-video'
  | 'image-to-video'

export interface StoredGeneration {
  id: string
  projectId: string
  documentId: string
  /** 经对话发起时有值，直接点节点上的「生成」时为 null */
  sessionId: string | null
  messageId: string | null
  status: GenerationStatus
  kind: GenerationKind
  /** 生成参数原样留存，供复跑 */
  params: Record<string, unknown>
  /** 输入素材（图生图/图生视频的参考图）id 列表 */
  inputAssetIds: string[]
  /** 产出素材 id 列表 */
  outputAssetIds: string[]
  errorMessage: string | null
  createdAt: Date
  finishedAt: Date | null
}

export interface CreateGenerationInput {
  id?: string
  projectId: string
  documentId: string
  sessionId?: string
  messageId?: string
  kind: GenerationKind
  params: Record<string, unknown>
  inputAssetIds?: readonly string[]
}

export interface UpdateGenerationStatusPatch {
  outputAssetIds?: readonly string[]
  errorMessage?: string | null
}

export interface GenerationStore {
  /** 创建生成记录，初始 status 恒为 pending。 */
  createGeneration(input: CreateGenerationInput): Promise<StoredGeneration>
  getGeneration(generationId: string): Promise<StoredGeneration | null>
  /**
   * 状态推进。进入终态（succeeded/failed）时自动写 finishedAt；
   * pending/running 不显式改 finishedAt。generation 不存在时抛 P2025。
   */
  updateGenerationStatus(
    generationId: string,
    status: GenerationStatus,
    patch?: UpdateGenerationStatusPatch,
  ): Promise<StoredGeneration>
}

const TERMINAL_STATUSES: readonly GenerationStatus[] = ['succeeded', 'failed']

function toStoredGeneration(generation: PrismaGeneration): StoredGeneration {
  return {
    id: generation.id,
    projectId: generation.projectId,
    documentId: generation.documentId,
    sessionId: generation.sessionId,
    messageId: generation.messageId,
    status: generation.status as GenerationStatus,
    kind: generation.kind as GenerationKind,
    params: generation.params as Record<string, unknown>,
    inputAssetIds: generation.inputAssetIds as string[],
    outputAssetIds: generation.outputAssetIds as string[],
    errorMessage: generation.errorMessage,
    createdAt: generation.createdAt,
    finishedAt: generation.finishedAt,
  }
}

export function createGenerationStore(client: PrismaClient): GenerationStore {
  return {
    async createGeneration(input) {
      const generation = await client.generation.create({
        data: {
          ...(input.id === undefined ? {} : { id: input.id }),
          projectId: input.projectId,
          documentId: input.documentId,
          ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
          ...(input.messageId === undefined ? {} : { messageId: input.messageId }),
          status: 'pending',
          kind: input.kind,
          params: { ...input.params } as Prisma.InputJsonValue,
          inputAssetIds: [...(input.inputAssetIds ?? [])],
          outputAssetIds: [],
        },
      })
      return toStoredGeneration(generation)
    },

    async getGeneration(generationId) {
      const generation = await client.generation.findUnique({ where: { id: generationId } })
      return generation === null ? null : toStoredGeneration(generation)
    },

    async updateGenerationStatus(generationId, status, patch) {
      const generation = await client.generation.update({
        where: { id: generationId },
        data: {
          status,
          ...(patch?.outputAssetIds === undefined
            ? {}
            : { outputAssetIds: [...patch.outputAssetIds] }),
          ...(patch?.errorMessage === undefined ? {} : { errorMessage: patch.errorMessage }),
          ...(TERMINAL_STATUSES.includes(status) ? { finishedAt: new Date() } : {}),
        },
      })
      return toStoredGeneration(generation)
    },
  }
}

const defaultStore = createGenerationStore(prisma)

export const createGeneration = defaultStore.createGeneration
export const getGeneration = defaultStore.getGeneration
export const updateGenerationStatus = defaultStore.updateGenerationStatus
