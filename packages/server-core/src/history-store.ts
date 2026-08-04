import type { CanvasOp } from '@framewright/core'
import { Prisma, type HistoryEntry as PrismaHistoryEntry, type PrismaClient } from '@prisma/client'
import { prisma } from './prisma'

/** 每个 document 只保留最近 N 条操作日志，写入时裁掉更早的（docs/domain.md §4.5）。 */
export const HISTORY_LIMIT = 200

export interface StoredHistoryEntry {
  id: string
  documentId: string
  seq: number
  op: CanvasOp
  createdAt: Date
}

/** seq 读取区间，两端含。 */
export interface HistorySeqRange {
  fromSeq?: number
  toSeq?: number
}

export interface HistoryStore {
  /**
   * 追加一条操作日志：丢弃 seq > historySeq 的重放分支，新条目取 seq = historySeq + 1，
   * 同事务推进 document.historySeq 并按 HISTORY_LIMIT 裁剪。document 不存在时抛 P2025。
   */
  appendOp(documentId: string, op: CanvasOp): Promise<StoredHistoryEntry>
  /** 按 seq 升序读取，可给区间（两端含）。document 不存在时抛 P2025。 */
  getEntries(documentId: string, range?: HistorySeqRange): Promise<StoredHistoryEntry[]>
  /** 读取当前 historySeq。document 不存在时抛 P2025。 */
  getHistorySeq(documentId: string): Promise<number>
  /** historySeq 的前进（重做）与后退（撤销）。document 不存在时抛 P2025。 */
  setHistorySeq(documentId: string, historySeq: number): Promise<number>
}

function toJson(op: CanvasOp): Prisma.InputJsonValue {
  return op as unknown as Prisma.InputJsonValue
}

function toStoredEntry(entry: PrismaHistoryEntry): StoredHistoryEntry {
  return {
    id: entry.id,
    documentId: entry.documentId,
    seq: entry.seq,
    op: entry.op as unknown as CanvasOp,
    createdAt: entry.createdAt,
  }
}

export function createHistoryStore(client: PrismaClient): HistoryStore {
  return {
    async appendOp(documentId, op) {
      return client.$transaction(async (tx) => {
        const document = await tx.document.findUniqueOrThrow({ where: { id: documentId } })
        const seq = document.historySeq + 1
        await tx.historyEntry.deleteMany({
          where: { documentId, seq: { gt: document.historySeq } },
        })
        const entry = await tx.historyEntry.create({
          data: { documentId, seq, op: toJson(op) },
        })
        await tx.document.update({ where: { id: documentId }, data: { historySeq: seq } })
        await tx.historyEntry.deleteMany({
          where: { documentId, seq: { lte: seq - HISTORY_LIMIT } },
        })
        return toStoredEntry(entry)
      })
    },

    async getEntries(documentId, range) {
      await client.document.findUniqueOrThrow({ where: { id: documentId } })
      const entries = await client.historyEntry.findMany({
        where: {
          documentId,
          seq: { gte: range?.fromSeq, lte: range?.toSeq },
        },
        orderBy: { seq: 'asc' },
      })
      return entries.map(toStoredEntry)
    },

    async getHistorySeq(documentId) {
      const document = await client.document.findUniqueOrThrow({ where: { id: documentId } })
      return document.historySeq
    },

    async setHistorySeq(documentId, historySeq) {
      const document = await client.document.update({
        where: { id: documentId },
        data: { historySeq },
      })
      return document.historySeq
    },
  }
}

const defaultStore = createHistoryStore(prisma)

export const appendOp = defaultStore.appendOp
export const getEntries = defaultStore.getEntries
export const getHistorySeq = defaultStore.getHistorySeq
export const setHistorySeq = defaultStore.setHistorySeq
