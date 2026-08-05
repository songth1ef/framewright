import {
  DEFAULT_VIEWPORT,
  NOOP_RENDERER_CALLBACKS,
  createAiImageNode,
  createFrameNode,
  type RendererCallbacks,
} from '@framewright/core'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDomRenderer } from '../index'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

let container: HTMLElement | null = null

afterEach(() => {
  container?.remove()
  container = null
  vi.restoreAllMocks()
})

function createCallbacks(): RendererCallbacks {
  return {
    onSelectionRequest: vi.fn(),
    onNodesMove: vi.fn(),
    onNodesResize: vi.fn(),
    onNodesDelete: vi.fn(),
    onViewportChange: vi.fn(),
    onNodeActivate: vi.fn(),
    onNodeAction: vi.fn(),
  }
}

describe('生成单元 hover 业务工具条', () => {
  it('在生成单元上方提供重生成、下载与删除三个画布外操作', async () => {
    const callbacks = createCallbacks()
    const renderer = createDomRenderer()
    container = document.createElement('div')
    document.body.appendChild(container)

    await act(async () =>
      renderer.mount(container!, {
        root: createFrameNode({
          fwId: 'root',
          width: 800,
          height: 600,
          children: [
            createAiImageNode({
              fwId: 'generated-image',
              x: 20,
              y: 80,
              width: 240,
              height: 160,
              status: 'succeeded',
              src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
            }),
          ],
        }),
        selection: [],
        viewport: DEFAULT_VIEWPORT,
        callbacks,
      }),
    )

    const node = container.querySelector('[data-fw-id="generated-image"]') as HTMLElement
    const toolbar = node.querySelector('[data-fw-node-toolbar]') as HTMLElement
    const buttons = [...toolbar.querySelectorAll('button')]

    expect(toolbar).not.toBeNull()
    expect(toolbar.style.bottom).toBe('calc(100% + 8px)')
    expect(buttons.map((button) => button.textContent)).toEqual(['重新生成', '下载', '删除'])
    expect(buttons.every((button) => button.dataset.fwInteraction === 'ignore')).toBe(true)

    for (const button of buttons) {
      await act(async () => {
        button.dispatchEvent(
          new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
        )
        window.dispatchEvent(
          new MouseEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }),
        )
        button.click()
      })
    }

    expect(callbacks.onNodeAction).toHaveBeenNthCalledWith(1, 'generated-image', 'regenerate')
    expect(callbacks.onNodeAction).toHaveBeenNthCalledWith(2, 'generated-image', 'download')
    expect(callbacks.onNodeAction).toHaveBeenNthCalledWith(3, 'generated-image', 'delete')
    expect(callbacks.onSelectionRequest).not.toHaveBeenCalled()
    expect(callbacks.onNodesMove).not.toHaveBeenCalled()
    expect(callbacks.onNodesDelete).not.toHaveBeenCalled()

    await act(async () => renderer.destroy())
  })

  it('用 CSS hover 控制显隐，不把 hover 状态写入渲染器或 node 树', async () => {
    const renderer = createDomRenderer()
    container = document.createElement('div')
    document.body.appendChild(container)

    await act(async () =>
      renderer.mount(container!, {
        root: createFrameNode({
          fwId: 'root',
          width: 800,
          height: 600,
          children: [createAiImageNode({ fwId: 'empty-image', width: 240, height: 160 })],
        }),
        selection: [],
        viewport: DEFAULT_VIEWPORT,
        callbacks: NOOP_RENDERER_CALLBACKS,
      }),
    )

    const node = container.querySelector('[data-fw-id="empty-image"]') as HTMLElement
    const toolbar = node.querySelector('[data-fw-node-toolbar]') as HTMLElement
    const css = node.querySelector('style')?.textContent ?? ''

    expect(node.dataset.fwGenerationUnit).toBe('true')
    expect(toolbar.style.opacity).toBe('0')
    expect(toolbar.style.pointerEvents).toBe('none')
    expect(css).toContain('[data-fw-generation-unit="true"]:hover {')
    expect(css).toContain('z-index: 1')
    expect(css).toContain('[data-fw-generation-unit="true"]:hover > [data-fw-node-toolbar="true"]')
    expect(css).toContain('pointer-events: auto')

    await act(async () => renderer.destroy())
  })
})
