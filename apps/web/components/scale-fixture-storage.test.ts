import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCALE_FIXTURE_PARAMS,
  clearStoredScaleFixtureParams,
  readStoredScaleFixtureParams,
  writeStoredScaleFixtureParams,
} from './scale-fixture-storage'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key)
    },
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
}

describe('scale fixture params storage', () => {
  it('记住上次选择并原样读回', () => {
    const storage = memoryStorage()
    writeStoredScaleFixtureParams({ nodeCount: 10000, connectionPattern: 'many-to-many' }, storage)

    expect(readStoredScaleFixtureParams(storage)).toEqual({
      nodeCount: 10000,
      connectionPattern: 'many-to-many',
    })
  })

  it('无记录时回落默认参数', () => {
    expect(readStoredScaleFixtureParams(memoryStorage())).toEqual(DEFAULT_SCALE_FIXTURE_PARAMS)
  })

  it.each([
    ['损坏 JSON', '{'],
    ['节点数不在可选集合', JSON.stringify({ nodeCount: 500, connectionPattern: 'none' })],
    ['未知连线形态', JSON.stringify({ nodeCount: 100, connectionPattern: 'mesh' })],
    ['字段缺失', JSON.stringify({ nodeCount: 100 })],
  ])('坏数据回退默认并清除记录：%s', (_label, stored) => {
    const storage = memoryStorage()
    storage.setItem('framewright:scale-fixture-params', stored)

    expect(readStoredScaleFixtureParams(storage)).toEqual(DEFAULT_SCALE_FIXTURE_PARAMS)
    expect(storage.getItem('framewright:scale-fixture-params')).toBeNull()
  })

  it('清除后可重新写入', () => {
    const storage = memoryStorage()
    writeStoredScaleFixtureParams({ nodeCount: 100, connectionPattern: 'fanin' }, storage)
    clearStoredScaleFixtureParams(storage)
    expect(readStoredScaleFixtureParams(storage)).toEqual(DEFAULT_SCALE_FIXTURE_PARAMS)

    writeStoredScaleFixtureParams({ nodeCount: 1000, connectionPattern: 'none' }, storage)
    expect(readStoredScaleFixtureParams(storage)).toEqual({ nodeCount: 1000, connectionPattern: 'none' })
  })
})
