import type { ScaleFixtureConnectionPattern } from '@framewright/core'

/**
 * 大数据量生成入口的表单参数持久化。
 *
 * 参照 viewport-storage 的做法（commit ed1cf7a）：参数是「这个用户上次的选择」，
 * 不属于任何文档内容，因此按固定 key 存在 localStorage，读取时校验、坏数据清除回退。
 */

export const SCALE_FIXTURE_NODE_COUNT_OPTIONS = [100, 1000, 10000] as const
export type ScaleFixtureNodeCount = (typeof SCALE_FIXTURE_NODE_COUNT_OPTIONS)[number]

export const SCALE_FIXTURE_CONNECTION_PATTERNS = [
  'none',
  'fanin',
  'distributed',
  'many-to-many',
] as const satisfies readonly ScaleFixtureConnectionPattern[]

export interface ScaleFixtureParams {
  nodeCount: ScaleFixtureNodeCount
  connectionPattern: ScaleFixtureConnectionPattern
}

export const DEFAULT_SCALE_FIXTURE_PARAMS: ScaleFixtureParams = {
  nodeCount: 1000,
  connectionPattern: 'distributed',
}

const SCALE_FIXTURE_PARAMS_STORAGE_KEY = 'framewright:scale-fixture-params'

function browserStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

function isScaleFixtureParams(value: unknown): value is ScaleFixtureParams {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate['nodeCount'] === 'number' &&
    (SCALE_FIXTURE_NODE_COUNT_OPTIONS as readonly number[]).includes(candidate['nodeCount']) &&
    typeof candidate['connectionPattern'] === 'string' &&
    (SCALE_FIXTURE_CONNECTION_PATTERNS as readonly string[]).includes(candidate['connectionPattern'])
  )
}

export function readStoredScaleFixtureParams(storage = browserStorage()): ScaleFixtureParams {
  let stored: string | null
  try {
    stored = storage?.getItem(SCALE_FIXTURE_PARAMS_STORAGE_KEY) ?? null
  } catch {
    return DEFAULT_SCALE_FIXTURE_PARAMS
  }
  if (stored === null) return DEFAULT_SCALE_FIXTURE_PARAMS

  try {
    const parsed: unknown = JSON.parse(stored)
    if (isScaleFixtureParams(parsed)) return parsed
  } catch {
    // 统一走下方坏记录清理。
  }

  clearStoredScaleFixtureParams(storage)
  return DEFAULT_SCALE_FIXTURE_PARAMS
}

export function writeStoredScaleFixtureParams(
  params: ScaleFixtureParams,
  storage = browserStorage(),
): void {
  if (!isScaleFixtureParams(params)) return
  try {
    storage?.setItem(SCALE_FIXTURE_PARAMS_STORAGE_KEY, JSON.stringify(params))
  } catch {
    // localStorage 是可选能力；写入失败不应阻断生成入口。
  }
}

export function clearStoredScaleFixtureParams(storage = browserStorage()): void {
  try {
    storage?.removeItem(SCALE_FIXTURE_PARAMS_STORAGE_KEY)
  } catch {
    // 清理失败无实际影响：下次读取仍会校验并回退默认值。
  }
}
