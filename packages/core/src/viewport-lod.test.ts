import { describe, expect, it } from 'vitest'
import { getViewportLod } from './viewport-lod'

describe('getViewportLod', () => {
  it.each([
    [1, { detail: 'full', connections: 'curve' }],
    [0.5, { detail: 'full', connections: 'curve' }],
    [0.49, { detail: 'simplified', connections: 'line' }],
    [0.25, { detail: 'simplified', connections: 'line' }],
    [0.2, { detail: 'simplified', connections: 'line' }],
    [0.19, { detail: 'dot', connections: 'hidden' }],
    [0.1, { detail: 'dot', connections: 'hidden' }],
  ] as const)('scale=%s 时建议为 %o', (scale, expected) => {
    expect(getViewportLod(scale)).toEqual(expected)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('拒绝无效 scale：%s', (scale) => {
    expect(() => getViewportLod(scale)).toThrow(RangeError)
  })
})
