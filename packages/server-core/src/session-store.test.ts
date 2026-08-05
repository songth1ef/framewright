import { createBoxNode, createFrameNode } from '@framewright/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDocumentStore } from './document-store'
import { createSessionStore, type SessionStore } from './session-store'
import { createTestPrismaClient } from './test-db'

describe('Session store', () => {
  let prisma: Awaited<ReturnType<typeof createTestPrismaClient>>
  let store: SessionStore

  beforeEach(async () => {
    prisma = await createTestPrismaClient()
    await prisma.project.create({ data: { id: 'proj-a', name: '测试项目' } })
    store = createSessionStore(prisma)
  })

  afterEach(async () => {
    await prisma.$disconnect()
  })

  it('createSession 创建后可由 getSession 完整读回，不存在的 id 返回 null', async () => {
    const created = await store.createSession({ id: 'sess-a', projectId: 'proj-a', title: '预告片分镜' })

    expect(created).toMatchObject({ id: 'sess-a', projectId: 'proj-a', title: '预告片分镜' })
    expect(created.createdAt).toBeInstanceOf(Date)
    expect(created.updatedAt).toBeInstanceOf(Date)
    await expect(store.getSession('sess-a')).resolves.toEqual(created)
    await expect(store.getSession('missing')).resolves.toBeNull()
  })

  it('renameSession 改标题，listProjectSessions 把最近更新的排在前面', async () => {
    await store.createSession({ id: 'sess-a', projectId: 'proj-a', title: '对话 A' })
    await store.createSession({ id: 'sess-b', projectId: 'proj-a', title: '对话 B' })

    await store.renameSession('sess-a', '对话 A+')

    const sessions = await store.listProjectSessions('proj-a')
    expect(sessions.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: 'sess-a', title: '对话 A+' },
      { id: 'sess-b', title: '对话 B' },
    ])
  })

  it('appendMessage 顺序写入时 seq 从 1 递增，回溯锚点默认为空数组', async () => {
    await store.createSession({ id: 'sess-a', projectId: 'proj-a', title: '对话' })

    const first = await store.appendMessage('sess-a', { role: 'user', content: '来三个版本', documentId: 'doc-a' })
    const second = await store.appendMessage('sess-a', {
      role: 'assistant',
      content: '已发起三个生成任务',
      generationIds: ['gen-1'],
      nodeFwIds: ['node-1'],
    })

    expect(first).toMatchObject({
      seq: 1,
      role: 'user',
      content: '来三个版本',
      generationIds: [],
      nodeFwIds: [],
      documentId: 'doc-a',
    })
    expect(second).toMatchObject({
      seq: 2,
      role: 'assistant',
      generationIds: ['gen-1'],
      nodeFwIds: ['node-1'],
      documentId: null,
    })
    await expect(store.listMessages('sess-a')).resolves.toMatchObject([{ seq: 1 }, { seq: 2 }])
  })

  it('appendMessage 对不存在的 session 抛 P2025', async () => {
    await expect(store.appendMessage('missing', { role: 'user', content: 'hi' })).rejects.toMatchObject({
      code: 'P2025',
    })
  })

  it('🔴 并发写入 20 条消息，seq 恰好是 1..20 无重复', async () => {
    await store.createSession({ id: 'sess-a', projectId: 'proj-a', title: '对话' })

    const appended = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.appendMessage('sess-a', { role: 'user', content: `消息 ${index}` }),
      ),
    )

    expect(appended.map((message) => message.seq).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    )
    const messages = await store.listMessages('sess-a')
    expect(messages).toHaveLength(20)
    expect(messages.map((message) => message.seq)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    )
  })

  it('listMessages 对不存在的 session 抛 P2025', async () => {
    await expect(store.listMessages('missing')).rejects.toMatchObject({ code: 'P2025' })
  })

  it('正查：linkGenerations / linkNodeFwIds 追加去重，读回消息即得产物列表', async () => {
    await store.createSession({ id: 'sess-a', projectId: 'proj-a', title: '对话' })
    const message = await store.appendMessage('sess-a', {
      role: 'assistant',
      content: '已生成',
      generationIds: ['gen-1'],
    })

    await store.linkGenerations(message.id, ['gen-2', 'gen-1', 'gen-3'])
    await store.linkNodeFwIds(message.id, ['node-1', 'node-1', 'node-2'])

    const reread = await store.getMessage(message.id)
    expect(reread).toMatchObject({
      generationIds: ['gen-1', 'gen-2', 'gen-3'],
      nodeFwIds: ['node-1', 'node-2'],
    })
    await expect(store.linkGenerations('missing', ['gen-x'])).rejects.toMatchObject({ code: 'P2025' })
    await expect(store.linkNodeFwIds('missing', ['node-x'])).rejects.toMatchObject({ code: 'P2025' })
  })
})

describe('回溯双向索引', () => {
  let prisma: Awaited<ReturnType<typeof createTestPrismaClient>>
  let store: SessionStore

  beforeEach(async () => {
    prisma = await createTestPrismaClient()
    await prisma.project.create({ data: { id: 'proj-a', name: '测试项目' } })
    store = createSessionStore(prisma)
  })

  afterEach(async () => {
    await prisma.$disconnect()
  })

  /** 建一条消息 + 一个 originMessageId 指回它的画布节点，返回两者 id。 */
  async function seedMessageAndNode() {
    await store.createSession({ id: 'sess-a', projectId: 'proj-a', title: '对话' })
    const message = await store.appendMessage('sess-a', { role: 'assistant', content: '已生成' })
    await store.linkNodeFwIds(message.id, ['node-1'])
    // originMessageId 尚未进 core 的 node schema（backend-domain §3 规划），按规划形状直接写入 JSON。
    const generatedNode = { ...createBoxNode({ fwId: 'node-1' }), originMessageId: message.id }
    const plainNode = createBoxNode({ fwId: 'node-2' })
    await createDocumentStore(prisma).createDocument({
      id: 'doc-a',
      projectId: 'proj-a',
      name: '画布 A',
      root: createFrameNode({ fwId: 'root', children: [generatedNode, plainNode] }),
    })
    return { message }
  }

  it('反查 + 正查：节点找回消息，消息列出它产出的节点，两个方向指向同一对关系', async () => {
    const { message } = await seedMessageAndNode()

    const found = await store.findMessageByNodeFwId('doc-a', 'node-1')
    expect(found).toEqual(await store.getMessage(message.id))
    // 反查找到的消息，其正向锚点必须包含出发的节点，双向闭环
    expect(found?.nodeFwIds).toContain('node-1')
  })

  it('节点不带 originMessageId、fwId 不存在、document 不存在时都返回 null', async () => {
    await seedMessageAndNode()

    await expect(store.findMessageByNodeFwId('doc-a', 'node-2')).resolves.toBeNull()
    await expect(store.findMessageByNodeFwId('doc-a', 'missing')).resolves.toBeNull()
    await expect(store.findMessageByNodeFwId('missing-doc', 'node-1')).resolves.toBeNull()
  })

  it('删 Session 级联删消息，但画布节点不陪葬，反查退化为 null', async () => {
    const { message } = await seedMessageAndNode()

    await store.deleteSession('sess-a')

    await expect(prisma.message.count()).resolves.toBe(0)
    await expect(store.getMessage(message.id)).resolves.toBeNull()
    // 画布与它上面的节点是独立生命周期，不因会话删除而消失
    const document = await createDocumentStore(prisma).getDocument('doc-a')
    expect(document).not.toBeNull()
    expect(JSON.stringify(document?.root)).toContain('node-1')
    await expect(store.findMessageByNodeFwId('doc-a', 'node-1')).resolves.toBeNull()
  })
})
