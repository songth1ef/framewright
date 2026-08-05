import { createAiImageNode, createAiVideoNode } from '@framewright/core'
import { describe, expect, it } from 'vitest'
import {
  assetContentUrl,
  buildSubmitFromNode,
  buildSubmitFromForm,
  createGenerationRunner,
  type GenerationBackend,
  type GenerationDto,
} from './generation-flow'

function makeGeneration(overrides: Partial<GenerationDto> = {}): GenerationDto {
  return {
    id: 'gen-1',
    status: 'pending',
    outputAssetIds: [],
    errorMessage: null,
    ...overrides,
  }
}

/** 按脚本依次返回 poll 结果的假后端。 */
function makeBackend(script: {
  submit?: Partial<GenerationDto> & { id?: string }
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
      return {
        generation: makeGeneration({ id: script.submit?.id ?? 'gen-1', ...script.submit }),
        taskId: 'task-1',
      }
    },
    async poll(generationId, taskId) {
      pollCalls.push([generationId, taskId])
      const next = script.polls[Math.min(pollIndex, script.polls.length - 1)]!
      pollIndex += 1
      return next
    },
  }
}

/** 收集快照直到终态或出错。 */
function runUntilDone(
  backend: GenerationBackend,
  request: Parameters<ReturnType<typeof createGenerationRunner>['start']>[0],
): Promise<{ snapshots: GenerationDto[]; errors: unknown[]; cancel: () => void }> {
  const runner = createGenerationRunner({ backend, pollIntervalMs: 0 })
  const snapshots: GenerationDto[] = []
  const errors: unknown[] = []
  return new Promise((resolve) => {
    const run = runner.start(request, {
      onSnapshot: (generation) => {
        snapshots.push(generation)
        if (generation.status === 'succeeded' || generation.status === 'failed') {
          resolve({ snapshots, errors, cancel: run.cancel })
        }
      },
      onError: (error) => {
        errors.push(error)
        resolve({ snapshots, errors, cancel: run.cancel })
      },
    })
  })
}

describe('buildSubmitFromNode', () => {
  it('ai-image 映射 text-to-image，带上节点留存的 prompt 与 params', () => {
    const node = createAiImageNode({
      fwId: 'a1',
      prompt: '一只猫',
      params: { model: 'mock-standard', size: '1024x1024' },
    })
    expect(buildSubmitFromNode(node)).toEqual({
      kind: 'text-to-image',
      prompt: '一只猫',
      options: { model: 'mock-standard', size: '1024x1024' },
    })
  })

  it('ai-video 映射 text-to-video', () => {
    const node = createAiVideoNode({ fwId: 'v1', prompt: '海浪', params: {} })
    expect(buildSubmitFromNode(node)).toEqual({
      kind: 'text-to-video',
      prompt: '海浪',
      options: {},
    })
  })
})

describe('buildSubmitFromForm', () => {
  it('表单值组装成提交参数；时长仅视频节点保留', () => {
    const imageNode = createAiImageNode({ fwId: 'a1' })
    expect(
      buildSubmitFromForm(imageNode, { prompt: ' p ', model: 'm', size: 's', duration: '5' }),
    ).toEqual({ kind: 'text-to-image', prompt: ' p ', options: { model: 'm', size: 's' } })

    const videoNode = createAiVideoNode({ fwId: 'v1' })
    expect(
      buildSubmitFromForm(videoNode, { prompt: 'p', model: 'm', size: 's', duration: '5' }),
    ).toEqual({
      kind: 'text-to-video',
      prompt: 'p',
      options: { model: 'm', size: 's', duration: 5 },
    })
  })
})

describe('assetContentUrl', () => {
  it('指向素材内容路由并转义 id', () => {
    expect(assetContentUrl('asset/1')).toBe('/api/assets/asset%2F1')
  })
})

describe('createGenerationRunner', () => {
  const request = {
    documentId: 'doc-1',
    params: { kind: 'text-to-image' as const, prompt: '一只猫' },
  }

  it('pending → running → succeeded 每次同步都上报，终态后停止轮询', async () => {
    const backend = makeBackend({
      submit: {},
      polls: [
        makeGeneration({ status: 'running' }),
        makeGeneration({ status: 'succeeded', outputAssetIds: ['asset-1'] }),
      ],
    })
    const { snapshots, errors } = await runUntilDone(backend, request)
    expect(errors).toEqual([])
    expect(snapshots.map((g) => g.status)).toEqual(['pending', 'running', 'succeeded'])
    // submit 返回一次快照 + 两次 poll，之后不再 poll
    expect(backend.pollCalls).toHaveLength(2)
    // poll 携带 submit 返回的 taskId
    expect(backend.pollCalls[0]).toEqual(['gen-1', 'task-1'])
  })

  it('failed 终态上报 errorMessage 并停止', async () => {
    const backend = makeBackend({
      submit: {},
      polls: [makeGeneration({ status: 'failed', errorMessage: '模拟失败' })],
    })
    const { snapshots } = await runUntilDone(backend, request)
    expect(snapshots.map((g) => g.status)).toEqual(['pending', 'failed'])
    expect(snapshots.at(-1)?.errorMessage).toBe('模拟失败')
    expect(backend.pollCalls).toHaveLength(1)
  })

  it('cancel 后不再 poll 也不再上报', async () => {
    const backend = makeBackend({
      submit: {},
      polls: [makeGeneration({ status: 'running' })],
    })
    const runner = createGenerationRunner({ backend, pollIntervalMs: 0 })
    const snapshots: GenerationDto[] = []
    // submit 是异步的，start 返回时快照尚未产生，句柄一定先就位
    const run = runner.start(request, {
      onSnapshot: (g) => {
        snapshots.push(g)
        run.cancel()
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(backend.pollCalls).toHaveLength(0)
    expect(snapshots).toHaveLength(1)
  })

  it('submit 抛错走 onError，不产生快照', async () => {
    const backend = makeBackend({ submitError: new Error('HTTP 404'), polls: [] })
    const { snapshots, errors } = await runUntilDone(backend, request)
    expect(snapshots).toEqual([])
    expect(errors).toHaveLength(1)
  })
})
