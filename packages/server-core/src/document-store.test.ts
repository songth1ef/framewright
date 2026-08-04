import { createBoxNode, createFrameNode } from '@framewright/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDocumentStore, createPrismaClient, type DocumentStore } from './index'

describe('Document store', () => {
  let prisma: ReturnType<typeof createPrismaClient>
  let store: DocumentStore

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
    store = createDocumentStore(prisma)
  })

  afterEach(async () => {
    await prisma.$disconnect()
  })

  it('createDocument 创建后可由 getDocument 完整读回', async () => {
    const root = createFrameNode({
      fwId: 'root',
      children: [createBoxNode({ fwId: 'box-a', x: 12, y: 34 })],
    })

    const created = await store.createDocument({ id: 'doc-a', name: '分镜 A', root })

    expect(created).toMatchObject({ id: 'doc-a', name: '分镜 A', root, historySeq: 0 })
    expect(created.createdAt).toBeInstanceOf(Date)
    expect(created.updatedAt).toBeInstanceOf(Date)
    await expect(store.getDocument('doc-a')).resolves.toEqual(created)
  })

  it('getDocument 对不存在的 id 返回 null', async () => {
    await expect(store.getDocument('missing')).resolves.toBeNull()
  })

  it('saveDocument 覆盖当前树、名称与 historySeq，保留同一 document id', async () => {
    const initialRoot = createFrameNode({ fwId: 'root' })
    await store.createDocument({ id: 'doc-a', name: '初始', root: initialRoot })
    const nextRoot = createFrameNode({
      fwId: 'root',
      children: [createBoxNode({ fwId: 'box-next', x: 50 })],
    })

    const saved = await store.saveDocument('doc-a', {
      name: '已更新',
      root: nextRoot,
      historySeq: 7,
    })

    expect(saved).toMatchObject({
      id: 'doc-a',
      name: '已更新',
      root: nextRoot,
      historySeq: 7,
    })
    await expect(store.getDocument('doc-a')).resolves.toEqual(saved)
  })
})
