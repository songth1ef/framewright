import { createBoxNode, createFrameNode } from '@framewright/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDocumentStore, type DocumentStore } from './index'
import { createTestPrismaClient } from './test-db'

describe('Document store', () => {
  let prisma: Awaited<ReturnType<typeof createTestPrismaClient>>
  let store: DocumentStore

  beforeEach(async () => {
    prisma = await createTestPrismaClient()
    await prisma.project.create({ data: { id: 'proj-a', name: '测试项目' } })
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

    const created = await store.createDocument({
      id: 'doc-a',
      projectId: 'proj-a',
      name: '分镜 A',
      root,
    })

    expect(created).toMatchObject({
      id: 'doc-a',
      projectId: 'proj-a',
      name: '分镜 A',
      root,
      historySeq: 0,
    })
    expect(created.createdAt).toBeInstanceOf(Date)
    expect(created.updatedAt).toBeInstanceOf(Date)
    await expect(store.getDocument('doc-a')).resolves.toEqual(created)
  })

  it('未指定 projectId 时在默认项目下创建画布', async () => {
    const created = await store.createDocument({
      id: 'doc-default',
      name: '未命名画布',
      root: createFrameNode({ fwId: 'root' }),
    })

    expect(created.projectId).toBe('default-project')
    await expect(prisma.project.findUnique({ where: { id: 'default-project' } })).resolves.toMatchObject({
      id: 'default-project',
      name: '默认项目',
    })
  })

  it('getDocument 对不存在的 id 返回 null', async () => {
    await expect(store.getDocument('missing')).resolves.toBeNull()
  })

  it('listDocuments 按最近更新时间倒序列出画布', async () => {
    const root = createFrameNode({ fwId: 'root' })
    await store.createDocument({ id: 'doc-a', projectId: 'proj-a', name: '画布 A', root })
    await store.createDocument({ id: 'doc-b', projectId: 'proj-a', name: '画布 B', root })
    await store.saveDocument('doc-a', { name: '画布 A+', root, historySeq: 0 })

    const documents = await store.listDocuments()

    expect(documents.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'doc-a', name: '画布 A+' },
      { id: 'doc-b', name: '画布 B' },
    ])
  })

  it('saveDocument 覆盖当前树、名称与 historySeq，保留同一 document id', async () => {
    const initialRoot = createFrameNode({ fwId: 'root' })
    await store.createDocument({ id: 'doc-a', projectId: 'proj-a', name: '初始', root: initialRoot })
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
      projectId: 'proj-a',
      name: '已更新',
      root: nextRoot,
      historySeq: 7,
    })
    await expect(store.getDocument('doc-a')).resolves.toEqual(saved)
  })
})
