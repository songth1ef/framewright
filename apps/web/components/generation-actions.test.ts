import { createAiImageNode, createAiVideoNode, NODE_ACTIONS } from '@framewright/core'
import { describe, expect, it } from 'vitest'
import {
  createGenerationController,
  isGenerationAction,
  patchFromGeneration,
  type GenerationNodePatch,
  type GenerationUnitNode,
} from './generation-actions'
import type { GenerationBackend, GenerationDto } from './generation-flow'

function makeGeneration(overrides: Partial<GenerationDto> = {}): GenerationDto {
  return { id: 'gen-1', status: 'pending', outputAssetIds: [], errorMessage: null, ...overrides }
}

/** 按脚本依次返回 poll 结果的假后端（与 generation-flow.test.ts 同款）。 */
function makeBackend(script: {
  submit?: Partial<GenerationDto>
  polls: GenerationDto[]
  submitError?: unknown
}): GenerationBackend & { submitCalls: unknown[]; pollCalls: unknown[] } {
  const submitCalls: unknown[] = []
  const pollCalls: unknown[] = []
  let pollIndex = 0
  return {
    submitCalls,
    pollCalls,
    async submit(request) {
      submitCalls.push(request)
      if (script.submitError !== undefined) throw script.submitError
      return { generation: makeGeneration({ ...script.submit }), taskId: 'task-1' }
    },
    async poll() {
      pollCalls.push(null)
      const next = script.polls[Math.min(pollIndex, script.polls.length - 1)]!
      pollIndex += 1
      return next
    },
  }
}

interface Harness {
  controller: ReturnType<typeof createGenerationController>
  backend: ReturnType<typeof makeBackend>
  patches: Array<{ fwId: string; patch: GenerationNodePatch }>
  errors: Array<{ fwId: string; error: unknown }>
  nodes: Map<string, GenerationUnitNode>
}

function makeHarness(options: {
  backend: ReturnType<typeof makeBackend>
  documentId?: string | undefined
  nodes?: GenerationUnitNode[]
}): Harness {
  const patches: Harness['patches'] = []
  const errors: Harness['errors'] = []
  const nodes = new Map((options.nodes ?? []).map((node) => [node.fwId, node]))
  const controller = createGenerationController({
    backend: options.backend,
    pollIntervalMs: 0,
    getDocumentId: () => options.documentId,
    getNode: (fwId) => nodes.get(fwId) ?? null,
    onNodePatch: (fwId, patch) => patches.push({ fwId, patch }),
    onError: (fwId, error) => errors.push({ fwId, error }),
  })
  return { controller, backend: options.backend, patches, errors, nodes }
}

const imageNode = () =>
  createAiImageNode({
    fwId: 'a1',
    prompt: '一只猫',
    params: { model: 'mock-standard', size: '1024x1024' },
  })

/** 等异步轮询链跑完（pollIntervalMs=0 时仍需让出事件循环）。 */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20))

describe('isGenerationAction', () => {
  it('只认 generate / retry / regenerate，download 等不接管', () => {
    expect(isGenerationAction(NODE_ACTIONS.generate)).toBe(true)
    expect(isGenerationAction(NODE_ACTIONS.retry)).toBe(true)
    expect(isGenerationAction(NODE_ACTIONS.regenerate)).toBe(true)
    expect(isGenerationAction(NODE_ACTIONS.download)).toBe(false)
    expect(isGenerationAction('whatever')).toBe(false)
  })
})

describe('patchFromGeneration', () => {
  it('pending / running 只同步状态并清空错误', () => {
    expect(patchFromGeneration(makeGeneration({ status: 'pending' }))).toEqual({
      status: 'pending',
      errorMessage: null,
    })
    expect(patchFromGeneration(makeGeneration({ status: 'running' }))).toEqual({
      status: 'running',
      errorMessage: null,
    })
  })

  it('succeeded 用首个产出素材拼内容路由', () => {
    expect(
      patchFromGeneration(makeGeneration({ status: 'succeeded', outputAssetIds: ['asset-1'] })),
    ).toEqual({ status: 'succeeded', src: '/api/assets/asset-1', errorMessage: null })
  })

  it('succeeded 但没有产出素材按失败呈现，不渲染裂图', () => {
    expect(patchFromGeneration(makeGeneration({ status: 'succeeded' }))).toEqual({
      status: 'failed',
      errorMessage: '生成成功但未返回素材',
    })
  })

  it('failed 带上 errorMessage，缺失时兜底文案', () => {
    expect(patchFromGeneration(makeGeneration({ status: 'failed', errorMessage: '超时' }))).toEqual({
      status: 'failed',
      errorMessage: '超时',
    })
    expect(patchFromGeneration(makeGeneration({ status: 'failed' }))).toEqual({
      status: 'failed',
      errorMessage: '生成失败',
    })
  })
})

describe('createGenerationController', () => {
  it('点生成后状态按 pending → running → succeeded 依次落补丁，终态带素材地址', async () => {
    const backend = makeBackend({
      polls: [
        makeGeneration({ status: 'running' }),
        makeGeneration({ status: 'succeeded', outputAssetIds: ['asset-1'] }),
      ],
    })
    const { controller, patches } = makeHarness({ backend, documentId: 'doc-1', nodes: [imageNode()] })

    expect(controller.handleAction('a1', NODE_ACTIONS.generate)).toBe(true)
    await flush()

    // 提交参数来自节点留存的 prompt / params
    expect(backend.submitCalls).toEqual([
      {
        documentId: 'doc-1',
        params: {
          kind: 'text-to-image',
          prompt: '一只猫',
          options: { model: 'mock-standard', size: '1024x1024' },
        },
      },
    ])
    // 第 0 条是点击瞬间的乐观 pending，其后每次快照一条
    expect(patches.map((p) => p.patch.status)).toEqual([
      'pending',
      'pending',
      'running',
      'succeeded',
    ])
    expect(patches.at(-1)?.patch.src).toBe('/api/assets/asset-1')
    expect(backend.pollCalls).toHaveLength(2)
  })

  it('failed 终态把 errorMessage 落到节点上', async () => {
    const backend = makeBackend({
      polls: [makeGeneration({ status: 'failed', errorMessage: '模拟失败' })],
    })
    const { controller, patches } = makeHarness({ backend, documentId: 'doc-1', nodes: [imageNode()] })

    controller.handleAction('a1', NODE_ACTIONS.retry)
    await flush()

    expect(patches.at(-1)?.patch).toEqual({ status: 'failed', errorMessage: '模拟失败' })
  })

  it('在途（pending/running）时连点被忽略，不会重复提交花钱的任务', async () => {
    const backend = makeBackend({
      polls: [
        makeGeneration({ status: 'running' }),
        makeGeneration({ status: 'succeeded', outputAssetIds: ['asset-1'] }),
      ],
    })
    const { controller, patches } = makeHarness({ backend, documentId: 'doc-1', nodes: [imageNode()] })

    expect(controller.handleAction('a1', NODE_ACTIONS.generate)).toBe(true)
    expect(controller.handleAction('a1', NODE_ACTIONS.generate)).toBe(true)
    await flush()

    expect(backend.submitCalls).toHaveLength(1)
    expect(patches.map((p) => p.patch.status)).toEqual([
      'pending',
      'pending',
      'running',
      'succeeded',
    ])
    expect(backend.pollCalls).toHaveLength(2)
  })

  it('cancelNode 后不再产生任何补丁', async () => {
    const backend = makeBackend({
      polls: [
        makeGeneration({ status: 'running' }),
        makeGeneration({ status: 'succeeded', outputAssetIds: ['asset-1'] }),
      ],
    })
    const { controller, patches } = makeHarness({ backend, documentId: 'doc-1', nodes: [imageNode()] })

    controller.handleAction('a1', NODE_ACTIONS.generate)
    controller.cancelNode('a1')
    await flush()

    // 只有点击瞬间的乐观 pending；submit 快照及之后全部被丢弃
    expect(patches.map((p) => p.patch.status)).toEqual(['pending'])
    expect(backend.pollCalls).toHaveLength(0)
  })

  it('submit 抛错把节点置 failed 并报 onError', async () => {
    const backend = makeBackend({ submitError: new Error('HTTP 404'), polls: [] })
    const { controller, patches, errors } = makeHarness({
      backend,
      documentId: 'doc-1',
      nodes: [imageNode()],
    })

    controller.handleAction('a1', NODE_ACTIONS.generate)
    await flush()

    expect(patches.at(-1)?.patch).toEqual({ status: 'failed', errorMessage: 'HTTP 404' })
    expect(errors).toHaveLength(1)
    expect(errors[0]?.fwId).toBe('a1')
  })

  it('download 等非生成动作不接管', () => {
    const backend = makeBackend({ polls: [] })
    const { controller } = makeHarness({ backend, documentId: 'doc-1', nodes: [imageNode()] })
    expect(controller.handleAction('a1', NODE_ACTIONS.download)).toBe(false)
    expect(backend.submitCalls).toHaveLength(0)
  })

  it('节点不存在或不是生成单元时不提交', () => {
    const backend = makeBackend({ polls: [] })
    const { controller } = makeHarness({ backend, documentId: 'doc-1' })
    expect(controller.handleAction('ghost', NODE_ACTIONS.generate)).toBe(false)
    expect(backend.submitCalls).toHaveLength(0)
  })

  it('无 documentId（demo 模式）不提交，报 onError', () => {
    const backend = makeBackend({ polls: [] })
    const { controller, errors } = makeHarness({
      backend,
      documentId: undefined,
      nodes: [imageNode()],
    })
    expect(controller.handleAction('a1', NODE_ACTIONS.generate)).toBe(true)
    expect(backend.submitCalls).toHaveLength(0)
    expect(errors).toHaveLength(1)
  })

  it('ai-video 节点提交 text-to-video', async () => {
    const backend = makeBackend({ polls: [makeGeneration({ status: 'failed' })] })
    const videoNode = createAiVideoNode({ fwId: 'v1', prompt: '海浪', params: { duration: 5 } })
    const { controller } = makeHarness({ backend, documentId: 'doc-1', nodes: [videoNode] })

    controller.handleAction('v1', NODE_ACTIONS.generate)
    await flush()

    expect(backend.submitCalls[0]).toEqual({
      documentId: 'doc-1',
      params: { kind: 'text-to-video', prompt: '海浪', options: { duration: 5 } },
    })
  })

  it('dispose 取消全部在途轮询', async () => {
    const backend = makeBackend({ polls: [makeGeneration({ status: 'running' })] })
    const { controller, patches } = makeHarness({
      backend,
      documentId: 'doc-1',
      nodes: [imageNode(), createAiImageNode({ fwId: 'a2', prompt: '狗' })],
    })

    controller.handleAction('a1', NODE_ACTIONS.generate)
    controller.handleAction('a2', NODE_ACTIONS.generate)
    controller.dispose()
    await flush()

    expect(backend.pollCalls).toHaveLength(0)
    expect(patches.filter((p) => p.patch.status === 'running')).toHaveLength(0)
  })
})
