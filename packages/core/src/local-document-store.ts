import type { FrameNode } from './node-schema'

/** 本地存储层级，按优先级从高到低排列。 */
export type StorageTier = 'opfs' | 'localStorage' | 'memory'

/**
 * 存储后端接口。
 * 测试通过注入 fake 实现来避免依赖真实 OPFS / localStorage。
 */
export interface StorageBackend {
  readonly name: StorageTier
  /** 同步探测当前环境是否可用。 */
  available(): boolean
  /** 异步写入。失败时抛出错误，由上层决定降级。 */
  write(key: string, payload: string): Promise<void>
  /** 异步读取。无数据时返回 null。 */
  read(key: string): Promise<string | null>
  /** 可选的删除接口，用于降级时清理旧层级数据。 */
  remove?(key: string): Promise<void>
}

/** 保存落盘结果。 */
export interface SaveResult {
  /** 数据最终落入的存储层级。 */
  tier: StorageTier
  /** 若发生降级，说明从哪级降级以及原因。 */
  downgraded?: { from: StorageTier; reason: string }
}

/**
 * save() 的同步收据。
 * tier 反映调用瞬间探测到的目标层级；实际落盘结果通过 committed 异步获取。
 */
export interface SaveReceipt {
  tier: StorageTier
  committed: Promise<SaveResult>
}

/** load() 返回值。 */
export interface LoadResult {
  root: FrameNode
  seq: number
  savedAt: number
}

type PendingPayload = {
  root: FrameNode
  seq: number
}

type DocState = {
  pending: PendingPayload | null
  flying: boolean
  flight: Promise<SaveResult> | null
}

/** 纯函数：探测当前环境是否支持 OPFS。 */
export function detectOpfsSupport(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage !== 'undefined' &&
    typeof navigator.storage.getDirectory === 'function'
  )
}

/** 真实 OPFS 后端。 */
export const opfsBackend: StorageBackend = {
  name: 'opfs',
  available: detectOpfsSupport,
  async write(key, payload) {
    const dir = await navigator.storage.getDirectory()
    const handle = await dir.getFileHandle(key, { create: true })
    const writer = await handle.createWritable()
    await writer.write(payload)
    await writer.close()
  },
  async read(key) {
    try {
      const dir = await navigator.storage.getDirectory()
      const handle = await dir.getFileHandle(key)
      const file = await handle.getFile()
      return await file.text()
    } catch {
      return null
    }
  },
  async remove(key) {
    try {
      const dir = await navigator.storage.getDirectory()
      await dir.removeEntry(key)
    } catch {
      // 忽略清理失败
    }
  },
}

/** 真实 localStorage 后端。 */
export const localStorageBackend: StorageBackend = {
  name: 'localStorage',
  available() {
    try {
      return typeof localStorage !== 'undefined'
    } catch {
      return false
    }
  },
  async write(key, payload) {
    localStorage.setItem(key, payload)
  },
  async read(key) {
    return localStorage.getItem(key)
  },
  async remove(key) {
    localStorage.removeItem(key)
  },
}

/** 内存后端工厂。默认新建独立 Map，测试可传入共享 Map。 */
export function createMemoryBackend(store = new Map<string, string>()): StorageBackend {
  return {
    name: 'memory',
    available: () => true,
    async write(key, payload) {
      store.set(key, payload)
    },
    async read(key) {
      return store.get(key) ?? null
    },
    async remove(key) {
      store.delete(key)
    },
  }
}

const STORAGE_KEY_PREFIX = 'fw:doc:'

export class LocalDocumentStore {
  private readonly backends: StorageBackend[]
  private readonly states = new Map<string, DocState>()

  constructor(backends: StorageBackend[] = defaultBackends()) {
    if (backends.length === 0) {
      throw new Error('LocalDocumentStore: 至少需要一个存储后端')
    }
    this.backends = backends
  }

  /**
   * 同步语义、异步落盘。
   * 同一 documentId 的连续调用会合并为最后一次实际写入，中间态被丢弃。
   */
  save(documentId: string, root: FrameNode, seq: number): SaveReceipt {
    const tier = this.pickTier()
    const state = this.getState(documentId)

    state.pending = { root, seq }

    if (!state.flying) {
      state.flying = true
      // 微任务调度：同步连续调用能在航班起飞前合并为最后一次 pending
      state.flight = Promise.resolve().then(() => this.runFlight(documentId))
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const committed = state.flight!
    return { tier, committed }
  }

  /** 异步读取指定文档。按后端优先级从高到低查找第一份有效数据。 */
  async load(documentId: string): Promise<LoadResult | null> {
    const key = this.key(documentId)

    for (const backend of this.backends) {
      if (!backend.available()) continue
      const raw = await backend.read(key)
      if (raw === null) continue
      try {
        const parsed = JSON.parse(raw) as unknown
        if (!isLoadResult(parsed)) {
          return null
        }
        return parsed
      } catch {
        return null
      }
    }

    return null
  }

  private runFlight(documentId: string): Promise<SaveResult> {
    return this.flushLoop(documentId).finally(() => {
      const state = this.states.get(documentId)
      if (state) {
        state.flying = false
        state.flight = null
      }
    })
  }

  private async flushLoop(documentId: string): Promise<SaveResult> {
    const state = this.states.get(documentId)
    if (!state) {
      return { tier: 'memory' }
    }

    let result: SaveResult = { tier: 'memory' }

    while (state.pending) {
      const payload = state.pending
      state.pending = null
      result = await this.writePayload(documentId, payload)
    }

    return result
  }

  private async writePayload(documentId: string, payload: PendingPayload): Promise<SaveResult> {
    const key = this.key(documentId)
    const serialized = JSON.stringify({
      root: payload.root,
      seq: payload.seq,
      savedAt: Date.now(),
    })

    let intendedTier: StorageTier | null = null
    let lastFailedTier: StorageTier | null = null
    let lastError = ''

    for (const backend of this.backends) {
      if (!backend.available()) continue

      if (intendedTier === null) {
        intendedTier = backend.name
      }

      try {
        await backend.write(key, serialized)
        if (backend.name === intendedTier) {
          return { tier: backend.name }
        }
        return {
          tier: backend.name,
          downgraded: { from: lastFailedTier ?? intendedTier, reason: lastError },
        }
      } catch (err) {
        lastFailedTier = backend.name
        lastError = err instanceof Error ? err.message : String(err)
        continue
      }
    }

    // 所有可用后端都失败，理论上不会发生（memory 总是可用），作为最后兜底。
    return {
      tier: 'memory',
      downgraded: {
        from: lastFailedTier ?? intendedTier ?? 'opfs',
        reason: lastError || '所有可用后端均写入失败',
      },
    }
  }

  private pickTier(): StorageTier {
    for (const backend of this.backends) {
      if (backend.available()) {
        return backend.name
      }
    }
    // 构造器保证至少有一个后端，且 memory 总是可用。
    return 'memory'
  }

  private getState(documentId: string): DocState {
    let state = this.states.get(documentId)
    if (!state) {
      state = { pending: null, flying: false, flight: null }
      this.states.set(documentId, state)
    }
    return state
  }

  private key(documentId: string): string {
    return `${STORAGE_KEY_PREFIX}${documentId}`
  }
}

function defaultBackends(): StorageBackend[] {
  return [opfsBackend, localStorageBackend, createMemoryBackend()]
}

function isLoadResult(value: unknown): value is LoadResult {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    'root' in v &&
    'seq' in v &&
    'savedAt' in v &&
    typeof v.seq === 'number' &&
    typeof v.savedAt === 'number'
  )
}
