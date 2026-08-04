import { describe, expect, it } from 'vitest'
import { applySelection } from './selection'

describe('applySelection', () => {
  describe('replace', () => {
    it('结果等于 requested 去重后', () => {
      expect(applySelection(['a'], ['b', 'c'], 'replace')).toEqual(['b', 'c'])
    })

    it('requested 内部有重复时去重且保序', () => {
      expect(applySelection([], ['b', 'a', 'b'], 'replace')).toEqual(['b', 'a'])
    })

    it('空 requested + replace = 清空选中集', () => {
      expect(applySelection(['a', 'b'], [], 'replace')).toEqual([])
    })
  })

  describe('toggle', () => {
    it('已在 current 的移除，不在的追加', () => {
      expect(applySelection(['a', 'b'], ['b', 'c'], 'toggle')).toEqual(['a', 'c'])
    })

    it('一次调用里同时含已选与未选项，两种都正确处理', () => {
      expect(applySelection(['a', 'b'], ['a', 'c', 'b', 'd'], 'toggle')).toEqual(['c', 'd'])
    })

    it('requested 内部重复不会重复追加', () => {
      expect(applySelection(['a'], ['b', 'b'], 'toggle')).toEqual(['a', 'b'])
    })
  })

  describe('add', () => {
    it('并集，current 在前、新增在后', () => {
      expect(applySelection(['a', 'b'], ['c', 'd'], 'add')).toEqual(['a', 'b', 'c', 'd'])
    })

    it('已存在的项不移动位置', () => {
      expect(applySelection(['a', 'b'], ['b', 'c'], 'add')).toEqual(['a', 'b', 'c'])
    })
  })

  it('不修改入参，返回新数组', () => {
    const current = ['a', 'b']
    const requested = ['b', 'c']
    const result = applySelection(current, requested, 'toggle')
    expect(current).toEqual(['a', 'b'])
    expect(requested).toEqual(['b', 'c'])
    expect(result).not.toBe(current)
  })
})
