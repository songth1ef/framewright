import { beforeEach, describe, expect, it, vi } from 'vitest'

const serverCore = vi.hoisted(() => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  getProject: vi.fn(),
  updateProject: vi.fn(),
  listProjectDocuments: vi.fn(),
  listProjectSessions: vi.fn(),
  createSession: vi.fn(),
  getSession: vi.fn(),
  renameSession: vi.fn(),
  deleteSession: vi.fn(),
  listMessages: vi.fn(),
  appendMessage: vi.fn(),
  getMessage: vi.fn(),
  linkGenerations: vi.fn(),
  linkNodeFwIds: vi.fn(),
  findMessageByNodeFwId: vi.fn(),
}))

vi.mock('@framewright/server-core', () => serverCore)

const context = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  for (const mock of Object.values(serverCore)) mock.mockResolvedValue({ id: 'result-a' })
  serverCore.listProjects.mockResolvedValue([])
  serverCore.listProjectDocuments.mockResolvedValue([])
  serverCore.listProjectSessions.mockResolvedValue([])
  serverCore.listMessages.mockResolvedValue([])
  serverCore.deleteSession.mockResolvedValue(undefined)
})

describe('projects / sessions / messages 生产路由接线', () => {
  it('所有 route.ts 都调用 server-core 导出，不包含 Route Handler 业务实现', async () => {
    const projects = await import('./projects/route')
    const project = await import('./projects/[id]/route')
    const documents = await import('./projects/[id]/documents/route')
    const sessions = await import('./projects/[id]/sessions/route')
    const session = await import('./sessions/[id]/route')
    const messages = await import('./sessions/[id]/messages/route')
    const message = await import('./messages/[id]/route')
    const generations = await import('./messages/[id]/generations/route')
    const nodes = await import('./messages/[id]/nodes/route')
    const reverseLookup = await import('./documents/[id]/nodes/[nodeFwId]/message/route')

    await projects.GET()
    await projects.POST(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ name: '项目' }) }))
    await project.GET(new Request('http://localhost/x'), context('project-a'))
    await project.PATCH(new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify({ name: '新项目' }) }), context('project-a'))
    await documents.GET(new Request('http://localhost/x'), context('project-a'))
    await sessions.GET(new Request('http://localhost/x'), context('project-a'))
    await sessions.POST(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ title: '对话' }) }), context('project-a'))
    await session.GET(new Request('http://localhost/x'), context('session-a'))
    await session.PATCH(new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify({ title: '新对话' }) }), context('session-a'))
    await session.DELETE(new Request('http://localhost/x'), context('session-a'))
    await messages.GET(new Request('http://localhost/x'), context('session-a'))
    await messages.POST(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ role: 'user', content: '生成' }) }), context('session-a'))
    await message.GET(new Request('http://localhost/x'), context('message-a'))
    await generations.POST(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ generationIds: ['generation-a'] }) }), context('message-a'))
    await nodes.POST(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ nodeFwIds: ['node-a'] }) }), context('message-a'))
    await reverseLookup.GET(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'document-a', nodeFwId: 'node-a' }) })

    expect(serverCore.listProjects).toHaveBeenCalledOnce()
    expect(serverCore.createProject).toHaveBeenCalledOnce()
    expect(serverCore.getProject).toHaveBeenCalledOnce()
    expect(serverCore.updateProject).toHaveBeenCalledOnce()
    expect(serverCore.listProjectDocuments).toHaveBeenCalledOnce()
    expect(serverCore.listProjectSessions).toHaveBeenCalledOnce()
    expect(serverCore.createSession).toHaveBeenCalledOnce()
    expect(serverCore.getSession).toHaveBeenCalledOnce()
    expect(serverCore.renameSession).toHaveBeenCalledOnce()
    expect(serverCore.deleteSession).toHaveBeenCalledOnce()
    expect(serverCore.listMessages).toHaveBeenCalledOnce()
    expect(serverCore.appendMessage).toHaveBeenCalledOnce()
    expect(serverCore.getMessage).toHaveBeenCalledOnce()
    expect(serverCore.linkGenerations).toHaveBeenCalledOnce()
    expect(serverCore.linkNodeFwIds).toHaveBeenCalledOnce()
    expect(serverCore.findMessageByNodeFwId).toHaveBeenCalledWith('document-a', 'node-a')
  })
})

