import { describe, expect, it } from 'vitest'
import { SHAPE_TYPES } from './node-schema'
import { DEFAULT_VIEWPORT, assertShapeCoverage } from './renderer-adapter'
import { createDemoDocument } from './demo-document'
import { collectNodeIds } from './node-tree'

describe('DEFAULT_VIEWPORT', () => {
  it('缩放 1、无偏移', () => {
    expect(DEFAULT_VIEWPORT).toEqual({ scale: 1, offsetX: 0, offsetY: 0 })
  })
})

describe('assertShapeCoverage', () => {
  it('覆盖全部 SHAPE_TYPES 时通过', () => {
    const full = Object.fromEntries(SHAPE_TYPES.map((t) => [t, () => null]))
    expect(() => assertShapeCoverage('dom', full)).not.toThrow()
  })

  it('缺任何一个 fwType 就抛错，并指名渲染器与缺失项', () => {
    const partial = { frame: () => null, box: () => null }
    expect(() => assertShapeCoverage('leafer', partial)).toThrowError(
      /renderer "leafer".*img.*video/s,
    )
  })
})

describe('createDemoDocument', () => {
  it('产出根 frame，含嵌套 frame 与多个 box，且覆盖全部 fwType', () => {
    const doc = createDemoDocument()
    expect(doc.fwType).toBe('frame')
    const ids = collectNodeIds(doc)
    expect(ids.length).toBeGreaterThanOrEqual(6)
    expect(ids[0]).toBe('root')
  })

  it('每次调用返回全新对象，互不共享引用', () => {
    const a = createDemoDocument()
    const b = createDemoDocument()
    expect(a).not.toBe(b)
    expect(a.children[0]).not.toBe(b.children[0])
  })
})
