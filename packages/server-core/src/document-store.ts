import type { FrameNode } from '@framewright/core'
import { Prisma, type Document as PrismaDocument, type PrismaClient } from '@prisma/client'
import { prisma } from './prisma'

export interface StoredDocument {
  id: string
  projectId: string
  name: string
  root: FrameNode
  historySeq: number
  createdAt: Date
  updatedAt: Date
}

export interface CreateDocumentInput {
  id?: string
  projectId?: string
  name: string
  root: FrameNode
}

export interface SaveDocumentInput {
  name: string
  root: FrameNode
  historySeq: number
}

export interface DocumentStore {
  listDocuments(): Promise<StoredDocument[]>
  /** 按 project 维度列举画布，按最近更新时间倒序。 */
  listProjectDocuments(projectId: string): Promise<StoredDocument[]>
  getDocument(documentId: string): Promise<StoredDocument | null>
  createDocument(input: CreateDocumentInput): Promise<StoredDocument>
  saveDocument(documentId: string, input: SaveDocumentInput): Promise<StoredDocument>
  /**
   * 🔴 只改名字，不碰 `root`。
   *
   * 别用「GET 整份 → 改 name → PUT 整份」代替它：画布有 800ms 防抖自动保存
   * 在持续写 `root`，读改写之间只要落进一次自动保存，**这次重命名就会把用户
   * 刚画的东西覆盖回旧快照**。窄更新没有这个窗口。
   */
  renameDocument(documentId: string, name: string): Promise<StoredDocument>
  /** 删除画布。它的 `HistoryEntry` 由外键级联一并清除，不留孤儿。 */
  deleteDocument(documentId: string): Promise<void>
}

function toJson(root: FrameNode): Prisma.InputJsonValue {
  return root as unknown as Prisma.InputJsonValue
}

function toStoredDocument(document: PrismaDocument): StoredDocument {
  return {
    id: document.id,
    projectId: document.projectId,
    name: document.name,
    root: document.root as unknown as FrameNode,
    historySeq: document.historySeq,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  }
}

const DEFAULT_PROJECT_ID = 'default-project'
const DEFAULT_PROJECT_NAME = '默认项目'

export function createDocumentStore(client: PrismaClient): DocumentStore {
  return {
    async listDocuments() {
      const documents = await client.document.findMany({
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      })
      return documents.map(toStoredDocument)
    },

    async listProjectDocuments(projectId) {
      const documents = await client.document.findMany({
        where: { projectId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      })
      return documents.map(toStoredDocument)
    },

    async getDocument(documentId) {
      const document = await client.document.findUnique({ where: { id: documentId } })
      return document === null ? null : toStoredDocument(document)
    },

    async createDocument(input) {
      const projectId = input.projectId ?? DEFAULT_PROJECT_ID
      if (input.projectId === undefined) {
        await client.project.upsert({
          where: { id: projectId },
          update: {},
          create: { id: projectId, name: DEFAULT_PROJECT_NAME },
        })
      }
      const document = await client.document.create({
        data: {
          ...(input.id === undefined ? {} : { id: input.id }),
          projectId,
          name: input.name,
          root: toJson(input.root),
        },
      })
      return toStoredDocument(document)
    },

    async saveDocument(documentId, input) {
      const document = await client.document.update({
        where: { id: documentId },
        data: {
          name: input.name,
          root: toJson(input.root),
          historySeq: input.historySeq,
        },
      })
      return toStoredDocument(document)
    },

    async renameDocument(documentId, name) {
      // 只写 name 这一列 —— 见接口上的注释，读改写会和防抖自动保存抢 `root`。
      const document = await client.document.update({
        where: { id: documentId },
        data: { name },
      })
      return toStoredDocument(document)
    },

    async deleteDocument(documentId) {
      await client.document.delete({ where: { id: documentId } })
    },
  }
}

const defaultStore = createDocumentStore(prisma)

export const listDocuments = defaultStore.listDocuments
export const listProjectDocuments = defaultStore.listProjectDocuments
export const getDocument = defaultStore.getDocument
export const createDocument = defaultStore.createDocument
export const saveDocument = defaultStore.saveDocument
export const renameDocument = defaultStore.renameDocument
export const deleteDocument = defaultStore.deleteDocument
