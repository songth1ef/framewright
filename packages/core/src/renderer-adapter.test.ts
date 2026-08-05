import { describe, expect, it } from 'vitest'
import { SHAPE_TYPES, isAiImageNode, isAiVideoNode } from './node-schema'
import {
  DEFAULT_CONNECTION_VISIBILITY,
  DEFAULT_INTERACTION_MODE,
  DEFAULT_VIEWPORT,
  assertShapeCoverage,
  resolveConnectionVisibility,
  resolveInteractionMode,
  type RendererCallbacks,
} from './renderer-adapter'
import { createDemoDocument } from './demo-document'
import { collectNodeIds, findNodeById } from './node-tree'

describe('DEFAULT_INTERACTION_MODE', () => {
  it('默认使用统一交互路径', () => {
    expect(DEFAULT_INTERACTION_MODE).toBe('unified')
    expect(resolveInteractionMode(undefined)).toBe('unified')
    expect(resolveInteractionMode('native')).toBe('native')
  })
})

describe('DEFAULT_CONNECTION_VISIBILITY', () => {
  it('默认显示连线，显式隐藏时保持隐藏', () => {
    expect(DEFAULT_CONNECTION_VISIBILITY).toBe('visible')
    expect(resolveConnectionVisibility(undefined)).toBe('visible')
    expect(resolveConnectionVisibility('hidden')).toBe('hidden')
  })
})

describe('DEFAULT_VIEWPORT', () => {
  it('缩放 1、无偏移', () => {
    expect(DEFAULT_VIEWPORT).toEqual({ scale: 1, offsetX: 0, offsetY: 0 })
  })
})

describe('RendererCallbacks', () => {
  it('完整覆盖渲染器合同规定的七条回调签名', () => {
    const calls: string[] = []
    const callbacks: RendererCallbacks = {
      onSelectionRequest: (fwIds, mode) => calls.push(`select:${fwIds.join(',')}:${mode}`),
      onNodesMove: (moves) => calls.push(`move:${moves.length}`),
      onNodesResize: (resizes) => calls.push(`resize:${resizes.length}`),
      onNodesDelete: (fwIds) => calls.push(`delete:${fwIds.join(',')}`),
      onViewportChange: (viewport) => calls.push(`viewport:${viewport.scale}`),
      onNodeActivate: (fwId) => calls.push(`activate:${fwId}`),
      onNodeAction: (fwId, action) => calls.push(`action:${fwId}:${action}`),
    }

    callbacks.onSelectionRequest(['node-1'], 'toggle')
    callbacks.onNodesMove([{ fwId: 'node-1', parentFwId: 'root', x: 1, y: 2 }])
    callbacks.onNodesResize([
      { fwId: 'node-1', parentFwId: 'root', x: 1, y: 2, width: 3, height: 4 },
    ])
    callbacks.onNodesDelete(['node-1'])
    callbacks.onViewportChange({ scale: 2, offsetX: 3, offsetY: 4 })
    callbacks.onNodeActivate('node-1')
    callbacks.onNodeAction('node-1', 'retry')

    expect(calls).toEqual([
      'select:node-1:toggle',
      'move:1',
      'resize:1',
      'delete:node-1',
      'viewport:2',
      'activate:node-1',
      'action:node-1:retry',
    ])
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

  it('包含一组溯源关系：一个 ai-image 派生两个 ai-video', () => {
    const doc = createDemoDocument()
    const image = findNodeById(doc, 'ai-image-1')
    const video1 = findNodeById(doc, 'ai-video-1')
    const video2 = findNodeById(doc, 'ai-video-2')
    expect(image !== null && isAiImageNode(image)).toBe(true)
    expect(video1 !== null && isAiVideoNode(video1)).toBe(true)
    expect(video2 !== null && isAiVideoNode(video2)).toBe(true)
    if (video1 !== null && isAiVideoNode(video1)) {
      expect(video1.sourceFwIds).toEqual(['ai-image-1'])
    }
    if (video2 !== null && isAiVideoNode(video2)) {
      expect(video2.sourceFwIds).toEqual(['ai-image-1'])
    }
  })
})
