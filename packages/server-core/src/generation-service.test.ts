import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAssetStore, type AssetStore } from './asset-store'
import { createLocalAssetStorage, type AssetStorage } from './asset-storage'
import {
  createGenerationService,
  type GenerationProviderPort,
  type GenerationService,
  type GenerationSubmitParams,
  type GenerationTaskSnapshot,
} from './generation-service'
import { createGenerationStore, type GenerationStore } from './generation-store'
import { createTestPrismaClient } from './test-db'

/** 可编排的假 provider：前 runningPolls 次 poll 报 running，之后进终态。 */
class FakeProvider implements GenerationProviderPort {
  readonly name = 'fake'
  readonly submittedParams: GenerationSubmitParams[] = []
  pollCount = 0

  constructor(
    private readonly outcome:
      | { status: 'succeeded'; result: GenerationTaskSnapshot['result'] }
      | { status: 'failed'; error: string },
    private readonly runningPolls = 1,
  ) {}

  async submit(params: GenerationSubmitParams): Promise<string> {
    this.submittedParams.push(params)
    return 'fake-task-1'
  }

  async poll(taskId: string): Promise<GenerationTaskSnapshot> {
    if (taskId !== 'fake-task-1') throw new Error(`未知任务：${taskId}`)
    this.pollCount += 1
    if (this.pollCount <= this.runningPolls) {
      return { id: taskId, kind: 'text-to-image', status: 'running', result: null, error: null }
    }
    if (this.outcome.status === 'succeeded') {
      return { id: taskId, kind: 'text-to-image', status: 'succeeded', result: this.outcome.result, error: null }
    }
    return { id: taskId, kind: 'text-to-image', status: 'failed', result: null, error: this.outcome.error }
  }
}

const SUCCESS_RESULT = [
  { url: 'https://placeholder.example/gen-img.png', kind: 'image' as const, width: 1024, height: 1024 },
]

describe('Generation service（生成任务编排）', () => {
  let prisma: Awaited<ReturnType<typeof createTestPrismaClient>>
  let generationStore: GenerationStore
  let assetStore: AssetStore
  let storage: AssetStorage
  let rootDir: string
  let nextAssetSeq: number

  const fakeFetcher = async (url: string) => ({
    data: new Uint8Array([9, 8, 7]),
    mimeType: url.endsWith('.mp4') ? 'video/mp4' : 'image/png',
  })

  function createService(provider: GenerationProviderPort): GenerationService {
    return createGenerationService({
      provider,
      generationStore,
      assetStore,
      storage,
      fetchAsset: fakeFetcher,
      idFactory: () => `asset-${++nextAssetSeq}`,
    })
  }

  beforeEach(async () => {
    prisma = await createTestPrismaClient()
    // Asset 有指向 Project 的外键，落素材前项目必须存在
    await prisma.project.create({ data: { id: 'proj-a', name: '测试项目' } })
    generationStore = createGenerationStore(prisma)
    assetStore = createAssetStore(prisma)
    rootDir = await mkdtemp(join(tmpdir(), 'fw-gen-'))
    storage = createLocalAssetStorage({ rootDir })
    nextAssetSeq = 0
  })

  afterEach(async () => {
    await prisma.$disconnect()
    await rm(rootDir, { recursive: true, force: true })
  })

  it('submitGeneration 落 pending 记录并调 provider.submit，返回 taskId', async () => {
    const provider = new FakeProvider({ status: 'succeeded', result: SUCCESS_RESULT })
    const service = createService(provider)

    const { generation, taskId } = await service.submitGeneration({
      projectId: 'proj-a',
      documentId: 'doc-a',
      sessionId: 'sess-a',
      messageId: 'msg-a',
      params: { kind: 'text-to-image', prompt: '一只猫', options: { size: '1K' } },
      inputAssetIds: [],
    })

    expect(taskId).toBe('fake-task-1')
    expect(provider.submittedParams).toEqual([
      { kind: 'text-to-image', prompt: '一只猫', options: { size: '1K' } },
    ])
    expect(generation).toMatchObject({
      projectId: 'proj-a',
      documentId: 'doc-a',
      sessionId: 'sess-a',
      messageId: 'msg-a',
      status: 'pending',
      kind: 'text-to-image',
    })
    await expect(generationStore.getGeneration(generation.id)).resolves.toMatchObject({
      status: 'pending',
      params: { kind: 'text-to-image', prompt: '一只猫', options: { size: '1K' } },
    })
  })

  it('pollGeneration 把 provider 的 running 状态同步进库', async () => {
    const provider = new FakeProvider({ status: 'succeeded', result: SUCCESS_RESULT }, 1)
    const service = createService(provider)
    const { generation } = await service.submitGeneration({
      projectId: 'proj-a', documentId: 'doc-a',
      params: { kind: 'text-to-image', prompt: '一只猫' },
    })

    const polled = await service.pollGeneration(generation.id)

    expect(polled.status).toBe('running')
    expect(polled.finishedAt).toBeNull()
  })

  it('🔴 成功闭环：产物落成 Asset（origin=generated、指回 generation），回填 outputAssetIds 与终态', async () => {
    const provider = new FakeProvider({ status: 'succeeded', result: SUCCESS_RESULT }, 0)
    const service = createService(provider)
    const { generation } = await service.submitGeneration({
      projectId: 'proj-a', documentId: 'doc-a',
      params: { kind: 'text-to-image', prompt: '一只猫' },
    })

    const done = await service.pollGeneration(generation.id)

    expect(done.status).toBe('succeeded')
    expect(done.outputAssetIds).toEqual(['asset-1'])
    expect(done.finishedAt).toBeInstanceOf(Date)

    const asset = await assetStore.getAsset('asset-1')
    expect(asset).toMatchObject({
      projectId: 'proj-a',
      kind: 'image',
      origin: 'generated',
      generationId: generation.id,
      storageKey: 'proj-a/asset-1.png',
      mimeType: 'image/png',
      byteSize: 3,
      width: 1024,
      height: 1024,
    })
    // 字节真的写进了本地存储
    const onDisk = await readFile(join(rootDir, 'proj-a', 'asset-1.png'))
    expect(new Uint8Array(onDisk)).toEqual(new Uint8Array([9, 8, 7]))
    await expect(storage.getUrl(asset!.storageKey)).resolves.toBe('/api/assets/proj-a/asset-1.png')
    // 回溯反查链路通
    await expect(assetStore.listGenerationAssets(generation.id)).resolves.toMatchObject([{ id: 'asset-1' }])
  })

  it('幂等：已到终态的 generation 重复 poll 不再调 provider、不重复落素材', async () => {
    const provider = new FakeProvider({ status: 'succeeded', result: SUCCESS_RESULT }, 0)
    const service = createService(provider)
    const { generation } = await service.submitGeneration({
      projectId: 'proj-a', documentId: 'doc-a',
      params: { kind: 'text-to-image', prompt: '一只猫' },
    })
    await service.pollGeneration(generation.id)
    const pollsAfterSuccess = provider.pollCount

    const again = await service.pollGeneration(generation.id)

    expect(again.status).toBe('succeeded')
    expect(provider.pollCount).toBe(pollsAfterSuccess)
    await expect(assetStore.listGenerationAssets(generation.id)).resolves.toHaveLength(1)
  })

  it('失败路径：status=failed、errorMessage 落库、finishedAt 有值、不产生素材', async () => {
    const provider = new FakeProvider({ status: 'failed', error: '内容审核未通过' }, 0)
    const service = createService(provider)
    const { generation } = await service.submitGeneration({
      projectId: 'proj-a', documentId: 'doc-a',
      params: { kind: 'text-to-image', prompt: '一只猫' },
    })

    const failed = await service.pollGeneration(generation.id)

    expect(failed.status).toBe('failed')
    expect(failed.errorMessage).toBe('内容审核未通过')
    expect(failed.finishedAt).toBeInstanceOf(Date)
    await expect(assetStore.listProjectAssets('proj-a')).resolves.toEqual([])
  })

  it('taskId 映射丢失时（如进程重启）可显式传 taskId；不传则抛明确错误', async () => {
    const provider = new FakeProvider({ status: 'succeeded', result: SUCCESS_RESULT }, 0)
    const service = createService(provider)
    const { generation, taskId } = await service.submitGeneration({
      projectId: 'proj-a', documentId: 'doc-a',
      params: { kind: 'text-to-image', prompt: '一只猫' },
    })
    // 换一个全新的 service 实例，模拟重启后内存映射丢失
    const freshService = createService(provider)

    await expect(freshService.pollGeneration(generation.id)).rejects.toThrow(/taskId/)

    const recovered = await freshService.pollGeneration(generation.id, taskId)
    expect(recovered.status).toBe('succeeded')
  })

  it('pollGeneration 对不存在的 generation 抛错', async () => {
    const provider = new FakeProvider({ status: 'succeeded', result: SUCCESS_RESULT }, 0)
    const service = createService(provider)

    await expect(service.pollGeneration('missing', 'fake-task-1')).rejects.toThrow(/missing/)
  })
})
