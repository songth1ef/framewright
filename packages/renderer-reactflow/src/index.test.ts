import { createFrameNode, NOOP_RENDERER_CALLBACKS } from '@framewright/core'
import { describe, expect, it } from 'vitest'
import { createReactFlowProbeRenderer } from './index'

describe('React Flow RendererAdapter 探针', () => {
  it('明确使用探针 id，且未挂载时量具为空', () => {
    const renderer = createReactFlowProbeRenderer()
    expect(renderer.id).toBe('reactflow')
    expect(renderer.displayName).toContain('探针')
    expect(renderer.getRenderedBounds()).toEqual(new Map())
    expect(renderer.getVisibleNodeIds()).toEqual([])
    renderer.destroy()
  })

  it('update 在未 mount 时不偷偷持有业务状态', () => {
    const renderer = createReactFlowProbeRenderer({ miniMap: true })
    renderer.update({
      root: createFrameNode({ fwId: 'root' }),
      selection: [],
      viewport: { scale: 1, offsetX: 0, offsetY: 0 },
      callbacks: NOOP_RENDERER_CALLBACKS,
    })
    expect(renderer.getRenderedBounds()).toEqual(new Map())
  })
})
