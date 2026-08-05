import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  NOOP_RENDERER_CALLBACKS,
  createAiImageNode,
  createBoxNode,
  createFrameNode,
  type RenderContext,
  type RendererCallbacks,
} from '@framewright/core'
import { createDomRenderer } from './index'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

let container: HTMLDivElement | null = null

afterEach(() => {
  container?.remove()
  container = null
})

function makeLodContext(scale: number, nodeCount = 40): RenderContext {
  const children = Array.from({ length: nodeCount }, (_, index) =>
    createAiImageNode({
      fwId: `node-${index}`,
      x: 100 + (index % 20),
      y: 100 + (index % 20),
      width: 120,
      height: 80,
      status: 'succeeded',
      src: '/fixture.png',
      prompt: `prompt-${index}`,
      sourceFwIds: index === 0 ? [] : [`node-${index - 1}`],
    }),
  )
  return {
    root: createFrameNode({ fwId: 'root', width: 10_000, height: 10_000, children }),
    selection: [],
    viewport: { scale, offsetX: 0, offsetY: 0 },
    interactionMode: 'unified',
    callbacks: NOOP_RENDERER_CALLBACKS,
  }
}

async function mount(ctx: RenderContext) {
  container = document.createElement('div')
  Object.defineProperties(container, {
    clientWidth: { configurable: true, value: 1_000 },
    clientHeight: { configurable: true, value: 700 },
  })
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1_000,
    bottom: 700,
    width: 1_000,
    height: 700,
    toJSON: () => ({}),
  })
  document.body.appendChild(container)
  const renderer = createDomRenderer()
  await act(async () => renderer.mount(container!, ctx))
  return renderer
}

describe('DOM viewport LOD', () => {
  it.each([
    { scale: 0.5, detail: 'full', minElements: 190, maxElements: 230 },
    { scale: 0.2, detail: 'simplified', minElements: 45, maxElements: 60 },
    { scale: 0.1, detail: 'dot', minElements: 40, maxElements: 60 },
  ] as const)(
    '$detail 档真实控制 DOM 元素数量级',
    async ({ scale, detail, minElements, maxElements }) => {
      const renderer = await mount(makeLodContext(scale))
      const elementCount = container!.querySelectorAll('*').length

      expect(container!.querySelector('[data-fw-viewport]')?.getAttribute('data-fw-lod')).toBe(
        detail,
      )
      expect(container!.querySelectorAll('[data-fw-id]')).toHaveLength(41)
      expect(elementCount).toBeGreaterThan(minElements)
      expect(elementCount).toBeLessThan(maxElements)
      if (detail === 'full') {
        expect(container!.querySelector('[data-fw-generation-surface]')).not.toBeNull()
        expect(container!.querySelector('[data-fw-connections] path')).not.toBeNull()
      } else if (detail === 'simplified') {
        expect(container!.querySelector('[data-fw-generation-surface]')).toBeNull()
        expect(container!.querySelector('[data-fw-connection-strokes]')).not.toBeNull()
        expect(container!.querySelector('[data-fw-connection-endpoints]')).toBeNull()
      } else {
        expect(container!.querySelector('[data-fw-generation-surface]')).toBeNull()
        expect(container!.querySelector('[data-fw-connections]')).toBeNull()
      }

      await act(async () => renderer.destroy())
    },
  )

  it('dot 档继续消费 core 的默认 1500 节点硬上限', async () => {
    const renderer = await mount(makeLodContext(0.1, 1_600))

    expect(container!.querySelectorAll('[data-fw-id]')).toHaveLength(1_500)
    expect(container!.querySelectorAll('*').length).toBeLessThan(1_510)

    await act(async () => renderer.destroy())
  })

  it.each(['unified', 'native'] as const)(
    'dot 档在 $interactionMode 拾取下仍能选中退化节点并维持 bounds / visible 契约',
    async (interactionMode) => {
    const onSelectionRequest = vi.fn<RendererCallbacks['onSelectionRequest']>()
    const root = createFrameNode({
      fwId: 'root',
      width: 100_000,
      height: 100_000,
      children: [
        createBoxNode({ fwId: 'near', x: 100, y: 100, width: 120, height: 80 }),
        createBoxNode({ fwId: 'far', x: 90_000, y: 90_000, width: 120, height: 80 }),
      ],
    })
    const renderer = await mount({
      root,
      selection: [],
      viewport: { scale: 0.1, offsetX: 0, offsetY: 0 },
      interactionMode,
      callbacks: { ...NOOP_RENDERER_CALLBACKS, onSelectionRequest },
    })

    const dot = container!.querySelector('[data-fw-id="near"]')!
    await act(async () => {
      dot.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 1,
          clientX: 16,
          clientY: 14,
        }),
      )
    })

    expect(onSelectionRequest).toHaveBeenCalledWith(['near'], 'replace')
    expect(container!.querySelector('[data-fw-id="far"]')).toBeNull()
    expect(renderer.getRenderedBounds().get('far')).toEqual({
      x: 90_000,
      y: 90_000,
      width: 120,
      height: 80,
    })
    expect(renderer.getVisibleNodeIds()).toEqual(['root', 'near', 'far'])

      await act(async () => renderer.destroy())
    },
  )

  it('跨档切换会移除旧档专属结构且不重建保留节点', async () => {
    const full = makeLodContext(0.5)
    const renderer = await mount(full)
    const nodeBefore = container!.querySelector('[data-fw-id="node-0"]')

    await act(async () => renderer.update({ ...full, viewport: { ...full.viewport, scale: 0.2 } }))
    expect(container!.querySelector('[data-fw-generation-surface]')).toBeNull()
    expect(container!.querySelector('[data-fw-connection-endpoints]')).toBeNull()

    const simplifiedNode = container!.querySelector('[data-fw-id="node-0"]')
    await act(async () =>
      renderer.update({ ...full, viewport: { ...full.viewport, scale: 0.1 } }),
    )
    expect(container!.querySelector('[data-fw-connections]')).toBeNull()
    expect(container!.querySelector('[data-fw-id="node-0"]')).toBe(simplifiedNode)
    expect(container!.contains(nodeBefore)).toBe(false)

    await act(async () => renderer.update(full))
    expect(container!.querySelector('[data-fw-generation-surface]')).not.toBeNull()
    expect(container!.querySelector('[data-fw-lod-node]')).toBeNull()

    await act(async () => renderer.destroy())
  })
})
