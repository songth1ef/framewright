import { findNodeById, type FrameNode } from '@framewright/core'
import { Prisma, type Message as PrismaMessage, type Session as PrismaSession, type PrismaClient } from '@prisma/client'
import { prisma } from './prisma'

export type MessageRole = 'user' | 'assistant' | 'system'

export interface StoredSession {
  id: string
  projectId: string
  title: string
  createdAt: Date
  updatedAt: Date
}

export interface StoredMessage {
  id: string
  sessionId: string
  seq: number
  role: MessageRole
  content: string
  /** 回溯锚点（正向）：这条消息发起的生成任务 id 列表 */
  generationIds: string[]
  /** 回溯锚点（正向）：这条消息在画布上产生的节点 fwId 列表 */
  nodeFwIds: string[]
  /** 发消息时用户所在的画布，只做记录不建外键 */
  documentId: string | null
  createdAt: Date
}

export interface CreateSessionInput {
  id?: string
  projectId: string
  title: string
}

export interface AppendMessageInput {
  id?: string
  role: MessageRole
  content: string
  generationIds?: readonly string[]
  nodeFwIds?: readonly string[]
  /** 发消息时用户所在的画布 */
  documentId?: string
}

export interface SessionStore {
  createSession(input: CreateSessionInput): Promise<StoredSession>
  getSession(sessionId: string): Promise<StoredSession | null>
  /** 按最近更新时间倒序列出项目下的全部对话。 */
  listProjectSessions(projectId: string): Promise<StoredSession[]>
  renameSession(sessionId: string, title: string): Promise<StoredSession>
  /** 删除对话，其全部消息随外键级联删除。session 不存在时抛 P2025。 */
  deleteSession(sessionId: string): Promise<void>

  /**
   * 追加一条消息：seq = 会话内当前最大 seq + 1。
   * 并发安全：取号与写入在同一事务内，撞 (sessionId, seq) 唯一约束时整事务重试，
   * 两条同时写入的消息不会拿到同一个 seq。session 不存在时抛 P2025。
   */
  appendMessage(sessionId: string, input: AppendMessageInput): Promise<StoredMessage>
  getMessage(messageId: string): Promise<StoredMessage | null>
  /** 按 seq 升序列出会话全部消息。session 不存在时抛 P2025。 */
  listMessages(sessionId: string): Promise<StoredMessage[]>

  /** 回溯写入：把产出的生成任务 id 登记到消息上（追加、去重）。message 不存在时抛 P2025。 */
  linkGenerations(messageId: string, generationIds: readonly string[]): Promise<StoredMessage>
  /** 回溯写入：把产出的画布节点 fwId 登记到消息上（追加、去重）。message 不存在时抛 P2025。 */
  linkNodeFwIds(messageId: string, nodeFwIds: readonly string[]): Promise<StoredMessage>

  /**
   * 回溯反查：从画布节点找回产生它的那条对话消息。
   * 路径 = 读 document 的 node 树 → 节点上的 originMessageId → Message。
   * 节点不存在、节点不带 originMessageId、或消息已随会话删除，都返回 null。
   */
  findMessageByNodeFwId(documentId: string, nodeFwId: string): Promise<StoredMessage | null>
}

/** (sessionId, seq) 唯一冲突时的重试上限。 */
const SEQ_CONFLICT_MAX_ATTEMPTS = 10

function toStoredSession(session: PrismaSession): StoredSession {
  return {
    id: session.id,
    projectId: session.projectId,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }
}

function toStoredMessage(message: PrismaMessage): StoredMessage {
  return {
    id: message.id,
    sessionId: message.sessionId,
    seq: message.seq,
    role: message.role as MessageRole,
    content: message.content,
    generationIds: message.generationIds as string[],
    nodeFwIds: message.nodeFwIds as string[],
    documentId: message.documentId,
    createdAt: message.createdAt,
  }
}

function isSeqConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export function createSessionStore(client: PrismaClient): SessionStore {
  const store: SessionStore = {
    async createSession(input) {
      const session = await client.session.create({
        data: {
          ...(input.id === undefined ? {} : { id: input.id }),
          projectId: input.projectId,
          title: input.title,
        },
      })
      return toStoredSession(session)
    },

    async getSession(sessionId) {
      const session = await client.session.findUnique({ where: { id: sessionId } })
      return session === null ? null : toStoredSession(session)
    },

    async listProjectSessions(projectId) {
      const sessions = await client.session.findMany({
        where: { projectId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      })
      return sessions.map(toStoredSession)
    },

    async renameSession(sessionId, title) {
      const session = await client.session.update({
        where: { id: sessionId },
        data: { title },
      })
      return toStoredSession(session)
    },

    async deleteSession(sessionId) {
      await client.session.delete({ where: { id: sessionId } })
    },

    async appendMessage(sessionId, input) {
      for (let attempt = 1; ; attempt += 1) {
        try {
          return await client.$transaction(async (tx) => {
            await tx.session.findUniqueOrThrow({ where: { id: sessionId } })
            const maxSeq = await tx.message.aggregate({
              where: { sessionId },
              _max: { seq: true },
            })
            const message = await tx.message.create({
              data: {
                ...(input.id === undefined ? {} : { id: input.id }),
                sessionId,
                seq: (maxSeq._max.seq ?? 0) + 1,
                role: input.role,
                content: input.content,
                generationIds: [...(input.generationIds ?? [])],
                nodeFwIds: [...(input.nodeFwIds ?? [])],
                ...(input.documentId === undefined ? {} : { documentId: input.documentId }),
              },
            })
            return toStoredMessage(message)
          })
        } catch (error) {
          if (isSeqConflict(error) && attempt < SEQ_CONFLICT_MAX_ATTEMPTS) continue
          throw error
        }
      }
    },

    async getMessage(messageId) {
      const message = await client.message.findUnique({ where: { id: messageId } })
      return message === null ? null : toStoredMessage(message)
    },

    async listMessages(sessionId) {
      await client.session.findUniqueOrThrow({ where: { id: sessionId } })
      const messages = await client.message.findMany({
        where: { sessionId },
        orderBy: { seq: 'asc' },
      })
      return messages.map(toStoredMessage)
    },

    async linkGenerations(messageId, generationIds) {
      return client.$transaction(async (tx) => {
        const message = await tx.message.findUniqueOrThrow({ where: { id: messageId } })
        const merged = [...(message.generationIds as string[])]
        for (const id of generationIds) {
          if (!merged.includes(id)) merged.push(id)
        }
        const updated = await tx.message.update({
          where: { id: messageId },
          data: { generationIds: merged },
        })
        return toStoredMessage(updated)
      })
    },

    async linkNodeFwIds(messageId, nodeFwIds) {
      return client.$transaction(async (tx) => {
        const message = await tx.message.findUniqueOrThrow({ where: { id: messageId } })
        const merged = [...(message.nodeFwIds as string[])]
        for (const fwId of nodeFwIds) {
          if (!merged.includes(fwId)) merged.push(fwId)
        }
        const updated = await tx.message.update({
          where: { id: messageId },
          data: { nodeFwIds: merged },
        })
        return toStoredMessage(updated)
      })
    },

    async findMessageByNodeFwId(documentId, nodeFwId) {
      const document = await client.document.findUnique({ where: { id: documentId } })
      if (document === null) return null
      const node = findNodeById(document.root as unknown as FrameNode, nodeFwId)
      if (node === null) return null
      // originMessageId 是回溯引用（docs/backend-domain.md §3）：普通列语义，不做生命周期耦合，
      // core 的 node schema 尚未落地该字段，这里按可选字段防御性读取。
      const originMessageId =
        (node as { originMessageId?: string | null }).originMessageId ?? null
      if (originMessageId === null) return null
      return store.getMessage(originMessageId)
    },
  }
  return store
}

const defaultStore = createSessionStore(prisma)

export const createSession = defaultStore.createSession
export const getSession = defaultStore.getSession
export const listProjectSessions = defaultStore.listProjectSessions
export const renameSession = defaultStore.renameSession
export const deleteSession = defaultStore.deleteSession
export const appendMessage = defaultStore.appendMessage
export const getMessage = defaultStore.getMessage
export const listMessages = defaultStore.listMessages
export const linkGenerations = defaultStore.linkGenerations
export const linkNodeFwIds = defaultStore.linkNodeFwIds
export const findMessageByNodeFwId = defaultStore.findMessageByNodeFwId
