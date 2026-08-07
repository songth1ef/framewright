import { describe, expect, it } from 'vitest'
import { createBoxNode, createFrameNode, type FrameNode } from './node-schema'
import {
  createMemoryBackend,
  detectOpfsSupport,
  LocalDocumentStore,
  type StorageBackend,
  type StorageTier,
} from './local-document-store'

function makeRoot(id: string): FrameNode {
  return createFrameNode({
    fwId: 'root',
    name: id,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    children: [createBoxNode({ fwId: 'box', name: id, x: 10, y: 10, width: 20, height: 20 })],
  })
}

function fakeBackend(
  name: StorageTier,
  options: {
    available?: boolean
    delay?: number
    fail?: Error | null
    store?: Map<string, string>
    onWrite?: () => void
  } = {},
): StorageBackend {
  const { available = true, delay = 0, fail = null, store = new Map(), onWrite } = options
  return {
    name,
    available: () => available,
    async write(key, payload) {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
      if (fail) {
        throw fail
      }
      store.set(key, payload)
      onWrite?.()
    },
    async read(key) {
      return store.get(key) ?? null
    },
    async remove(key) {
      store.delete(key)
    },
  }
}

describe('detectOpfsSupport', () => {
  it('Node 环境返回 false', () => {
    expect(detectOpfsSupport()).toBe(false)
  })
})

describe('三级降级', () => {
  it('OPFS 可用时选中 opfs', async () => {
    const opfs = fakeBackend('opfs')
    const memory = createMemoryBackend()
    const store = new LocalDocumentStore([opfs, memory])

    const receipt = store.save('doc-1', makeRoot('a'), 1)
    expect(receipt.tier).toBe('opfs')
    await receipt.committed
  })

  it('OPFS 不可用时降级到 localStorage', async () => {
    const opfs = fakeBackend('opfs', { available: false })
    const local = fakeBackend('localStorage')
    const memory = createMemoryBackend()
    const store = new LocalDocumentStore([opfs, local, memory])

    const receipt = store.save('doc-1', makeRoot('a'), 1)
    expect(receipt.tier).toBe('localStorage')
    await receipt.committed
  })

  it('OPFS 与 localStorage 都不可用时降级到 memory', async () => {
    const opfs = fakeBackend('opfs', { available: false })
    const local = fakeBackend('localStorage', { available: false })
    const memory = createMemoryBackend()
    const store = new LocalDocumentStore([opfs, local, memory])

    const receipt = store.save('doc-1', makeRoot('a'), 1)
    expect(receipt.tier).toBe('memory')
    await receipt.committed
  })
})

describe('连续写入合并', () => {
  it('同一文档连续写入只触发最后一次实际写入', async () => {
    let writeCount = 0
    const memory = createMemoryBackend()
    const slow = fakeBackend('opfs', {
      delay: 20,
      onWrite: () => {
        writeCount++
      },
      store: new Map(),
    })
    const store = new LocalDocumentStore([slow, memory])

    // 在第一次写入还没完成时连续发起多次保存
    const r1 = store.save('doc-1', makeRoot('v1'), 1)
    const r2 = store.save('doc-1', makeRoot('v2'), 2)
    const r3 = store.save('doc-1', makeRoot('v3'), 3)

    await Promise.all([r1.committed, r2.committed, r3.committed])

    // 只应有一次真实写入，内容是最后一次
    expect(writeCount).toBe(1)

    const loaded = await store.load('doc-1')
    expect(loaded?.seq).toBe(3)
    expect(loaded?.root.name).toBe('v3')
  })
})

describe('单写者保证', () => {
  it('同一 documentId 同时只有一个写入在飞', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const slow = fakeBackend('opfs', {
      delay: 30,
      store: new Map(),
    })
    const originalWrite = slow.write
    slow.write = async (key, payload) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      try {
        await originalWrite(key, payload)
      } finally {
        inFlight--
      }
    }

    const store = new LocalDocumentStore([slow, createMemoryBackend()])

    const receipts: ReturnType<typeof store.save>[] = []
    for (let i = 0; i < 5; i++) {
      receipts.push(store.save('doc-1', makeRoot(`v${i}`), i))
    }

    await Promise.all(receipts.map((r) => r.committed))

    expect(maxInFlight).toBe(1)
  })
})

describe('写失败降级', () => {
  it('OPFS 写入失败时降级到 localStorage 并在结果中说明原因', async () => {
    const opfs = fakeBackend('opfs', { fail: new Error('QuotaExceededError') })
    const local = fakeBackend('localStorage', { store: new Map() })
    const store = new LocalDocumentStore([opfs, local, createMemoryBackend()])

    const receipt = store.save('doc-1', makeRoot('a'), 1)
    expect(receipt.tier).toBe('opfs')

    const result = await receipt.committed
    expect(result.tier).toBe('localStorage')
    expect(result.downgraded).toEqual({
      from: 'opfs',
      reason: 'QuotaExceededError',
    })
  })

  it('OPFS 与 localStorage 都失败时降级到 memory', async () => {
    const opfs = fakeBackend('opfs', { fail: new Error('OPFS broken') })
    const local = fakeBackend('localStorage', { fail: new Error('localStorage disabled') })
    const memory = createMemoryBackend()
    const store = new LocalDocumentStore([opfs, local, memory])

    const receipt = store.save('doc-1', makeRoot('a'), 1)
    const result = await receipt.committed

    expect(result.tier).toBe('memory')
    expect(result.downgraded).toEqual({
      from: 'localStorage',
      reason: 'localStorage disabled',
    })
  })
})

describe('load 一致性', () => {
  it('load 读回的内容与 save 写入的一致', async () => {
    const memory = createMemoryBackend()
    const store = new LocalDocumentStore([memory])

    const root = makeRoot('persisted')
    const receipt = store.save('doc-1', root, 42)
    await receipt.committed

    const loaded = await store.load('doc-1')
    expect(loaded).not.toBeNull()
    expect(loaded!.seq).toBe(42)
    expect(loaded!.root).toEqual(root)
    expect(loaded!.savedAt).toBeTypeOf('number')
  })

  it('未保存过的文档返回 null', async () => {
    const store = new LocalDocumentStore([createMemoryBackend()])
    expect(await store.load('doc-missing')).toBeNull()
  })
})
