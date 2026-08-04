import { createFrameNode, type CanvasOp } from '@framewright/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createDocumentStore,
  createHistoryStore,
  createPrismaClient,
  HISTORY_LIMIT,
  type DocumentStore,
  type HistoryStore,
} from './index'

function makeMoveOp(x: number): CanvasOp {
  return {
    kind: 'move-node',
    fwId: 'box-a',
    from: { parentFwId: 'root', index: 0, x, y: 0 },
    to: { parentFwId: 'root', index: 0, x: x + 1, y: 0 },
  }
}

describe('History store', () => {
  let prisma: ReturnType<typeof createPrismaClient>
  let documents: DocumentStore
  let store: HistoryStore

  beforeEach(async () => {
    prisma = createPrismaClient(':memory:')
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "Document" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "root" JSONB NOT NULL,
        "historySeq" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      )
    `)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "HistoryEntry" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "documentId" TEXT NOT NULL,
        "seq" INTEGER NOT NULL,
        "op" JSONB NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "HistoryEntry_documentId_fkey"
          FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE
      )
    `)
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX "HistoryEntry_documentId_seq_key" ON "HistoryEntry"("documentId", "seq")
    `)
    documents = createDocumentStore(prisma)
    store = createHistoryStore(prisma)
    await documents.createDocument({
      id: 'doc-a',
      name: '分镜 A',
      root: createFrameNode({ fwId: 'root' }),
    })
  })

  afterEach(async () => {
    await prisma.$disconnect()
  })

  it('appendOp 写入条目并把 document.historySeq 推进到新 seq', async () => {
    const first = await store.appendOp('doc-a', makeMoveOp(0))
    expect(first).toMatchObject({ documentId: 'doc-a', seq: 1, op: makeMoveOp(0) })
    expect(first.id).toBeTruthy()
    expect(first.createdAt).toBeInstanceOf(Date)

    const second = await store.appendOp('doc-a', makeMoveOp(10))
    expect(second.seq).toBe(2)
    await expect(store.getHistorySeq('doc-a')).resolves.toBe(2)
  })

  it('getEntries 按 seq 升序返回全部条目', async () => {
    await store.appendOp('doc-a', makeMoveOp(0))
    await store.appendOp('doc-a', makeMoveOp(10))
    await store.appendOp('doc-a', makeMoveOp(20))

    const entries = await store.getEntries('doc-a')

    expect(entries.map((entry) => entry.seq)).toEqual([1, 2, 3])
    expect(entries[1]?.op).toEqual(makeMoveOp(10))
  })

  it('getEntries 支持按 seq 区间读取（两端含）', async () => {
    for (const x of [0, 10, 20, 30]) await store.appendOp('doc-a', makeMoveOp(x))

    const entries = await store.getEntries('doc-a', { fromSeq: 2, toSeq: 3 })

    expect(entries.map((entry) => entry.seq)).toEqual([2, 3])
    expect(entries[0]?.op).toEqual(makeMoveOp(10))
  })

  it('appendOp 丢弃 seq > historySeq 的重放分支后接着写', async () => {
    await store.appendOp('doc-a', makeMoveOp(0))
    await store.appendOp('doc-a', makeMoveOp(10))
    await store.appendOp('doc-a', makeMoveOp(20))
    await store.setHistorySeq('doc-a', 1)

    const appended = await store.appendOp('doc-a', makeMoveOp(99))

    expect(appended.seq).toBe(2)
    await expect(store.getHistorySeq('doc-a')).resolves.toBe(2)
    const entries = await store.getEntries('doc-a')
    expect(entries.map((entry) => entry.seq)).toEqual([1, 2])
    expect(entries[1]?.op).toEqual(makeMoveOp(99))
  })

  it(`appendOp 把每个 document 的日志裁剪到最近 ${HISTORY_LIMIT} 条`, async () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) {
      await store.appendOp('doc-a', makeMoveOp(i))
    }

    const entries = await store.getEntries('doc-a')

    expect(entries).toHaveLength(HISTORY_LIMIT)
    expect(entries[0]?.seq).toBe(6)
    expect(entries[HISTORY_LIMIT - 1]?.seq).toBe(HISTORY_LIMIT + 5)
    await expect(store.getHistorySeq('doc-a')).resolves.toBe(HISTORY_LIMIT + 5)
  })

  it('裁剪只影响本 document，不波及其它 document', async () => {
    await documents.createDocument({
      id: 'doc-b',
      name: '分镜 B',
      root: createFrameNode({ fwId: 'root' }),
    })
    await store.appendOp('doc-b', makeMoveOp(1000))
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) {
      await store.appendOp('doc-a', makeMoveOp(i))
    }

    await expect(store.getEntries('doc-b')).resolves.toHaveLength(1)
  })

  it('setHistorySeq 支持前进与后退，并随 document 读回', async () => {
    await store.appendOp('doc-a', makeMoveOp(0))
    await store.appendOp('doc-a', makeMoveOp(10))

    await expect(store.setHistorySeq('doc-a', 1)).resolves.toBe(1)
    await expect(store.getHistorySeq('doc-a')).resolves.toBe(1)
    expect((await documents.getDocument('doc-a'))?.historySeq).toBe(1)

    await expect(store.setHistorySeq('doc-a', 2)).resolves.toBe(2)
    await expect(store.getHistorySeq('doc-a')).resolves.toBe(2)
  })

  it('对不存在的 document 追加抛出 P2025，供路由层映射 404', async () => {
    await expect(store.appendOp('missing', makeMoveOp(0))).rejects.toMatchObject({
      code: 'P2025',
    })
  })

  it('对不存在的 document 读取抛出 P2025，供路由层映射 404', async () => {
    await expect(store.getEntries('missing')).rejects.toMatchObject({ code: 'P2025' })
    await expect(store.getHistorySeq('missing')).rejects.toMatchObject({ code: 'P2025' })
    await expect(store.setHistorySeq('missing', 1)).rejects.toMatchObject({ code: 'P2025' })
  })
})
