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
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      })
      return documents.map(toStoredDocument)
    },

    async listProjectDocuments(projectId) {
      const documents = await client.document.findMany({
        where: { projectId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
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
  }
}

const defaultStore = createDocumentStore(prisma)

export const listDocuments = defaultStore.listDocuments
export const getDocument = defaultStore.getDocument
export const createDocument = defaultStore.createDocument
export const saveDocument = defaultStore.saveDocument
