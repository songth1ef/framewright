import {
  DEFAULT_VIEWPORT,
  NODE_ACTIONS,
  createAiImageNode,
  createFrameNode,
  type AiImageNode,
  type RendererCallbacks,
} from '@framewright/core'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDomRenderer } from '../index'
import { GenerationUnit } from './generation-unit'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

let container: HTMLElement | null = null
let directRoot: Root | null = null

afterEach(async () => {
  if (directRoot !== null) {
    await act(async () => directRoot?.unmount())
    directRoot = null
  }
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

async function mountGenerationNode(
  node: AiImageNode,
  callbacks: RendererCallbacks,
  viewport = DEFAULT_VIEWPORT,
): Promise<{ renderer: ReturnType<typeof createDomRenderer>; nodeElement: HTMLElement }> {
  const renderer = createDomRenderer()
  container = document.createElement('div')
  document.body.appendChild(container)

  await act(async () =>
    renderer.mount(container!, {
      root: createFrameNode({
        fwId: 'root',
        width: 800,
        height: 600,
        children: [node],
      }),
      selection: [],
      viewport,
      callbacks,
    }),
  )

  return {
    renderer,
    nodeElement: container.querySelector(`[data-fw-id="${node.fwId}"]`)!,
  }
}

async function hoverNode(nodeElement: HTMLElement): Promise<HTMLElement> {
  await act(async () =>
    nodeElement.dispatchEvent(new MouseEvent('pointermove', { bubbles: true })),
  )
  return container!.querySelector('[data-fw-node-toolbar]') as HTMLElement
}

function toolbarButtons(toolbar: HTMLElement): HTMLButtonElement[] {
  return [...toolbar.querySelectorAll<HTMLButtonElement>('button')]
}

describe('生成单元 hover 业务工具条', () => {
  it('重新生成与下载走 NODE_ACTIONS，删除只走 onNodesDelete 专用通道', async () => {
    const callbacks = createCallbacks()
    const { renderer, nodeElement } = await mountGenerationNode(
      createAiImageNode({
        fwId: 'generated-image',
        x: 20,
        y: 80,
        width: 240,
        height: 160,
        status: 'succeeded',
        src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
      }),
      callbacks,
    )
    const toolbar = await hoverNode(nodeElement)
    const buttons = toolbarButtons(toolbar)

    expect(buttons.map((button) => button.textContent)).toEqual(['重新生成', '下载', '删除'])
    expect(buttons.every((button) => button.dataset.fwInteraction === 'ignore')).toBe(true)

    for (const button of buttons) {
      await act(async () => button.click())
    }

    expect(callbacks.onNodeAction).toHaveBeenNthCalledWith(
      1,
      'generated-image',
      NODE_ACTIONS.regenerate,
    )
    expect(callbacks.onNodeAction).toHaveBeenNthCalledWith(
      2,
      'generated-image',
      NODE_ACTIONS.download,
    )
    expect(callbacks.onNodeAction).toHaveBeenCalledTimes(2)
    expect(callbacks.onNodesDelete).toHaveBeenCalledOnce()
    expect(callbacks.onNodesDelete).toHaveBeenCalledWith(['generated-image'])
    expect(callbacks.onSelectionRequest).not.toHaveBeenCalled()
    expect(callbacks.onNodesMove).not.toHaveBeenCalled()

    await act(async () => renderer.destroy())
  })

  it.each([
    ['empty', ['下载', '删除'], true],
    ['pending', ['下载', '删除'], true],
    ['running', ['下载', '删除'], true],
    ['succeeded', ['重新生成', '下载', '删除'], false],
    ['failed', ['下载', '删除'], true],
  ] as const)('%s 状态只渲染卡片内主 CTA 未承载的工具条动作', async (status, expectedLabels, downloadDisabled) => {
    const callbacks = createCallbacks()
    const { renderer, nodeElement } = await mountGenerationNode(
      createAiImageNode({
        fwId: `image-${status}`,
        width: 240,
        height: 160,
        status,
        src: status === 'succeeded' ? 'result.png' : null,
        errorMessage: status === 'failed' ? '失败' : null,
      }),
      callbacks,
    )
    const toolbar = await hoverNode(nodeElement)
    const buttons = toolbarButtons(toolbar)
    const download = buttons.find((button) => button.textContent === '下载')!
    const remove = buttons.find((button) => button.textContent === '删除')!

    expect(buttons.map((button) => button.textContent)).toEqual(expectedLabels)
    expect(download.disabled).toBe(downloadDisabled)
    expect(remove.disabled).toBe(false)
    expect(download.style.opacity).toBe(downloadDisabled ? '0.38' : '1')
    expect(download.style.cursor).toBe(downloadDisabled ? 'not-allowed' : 'pointer')

    await act(async () => renderer.destroy())
  })

  it('激活同一节点时不渲染工具条', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    directRoot = createRoot(container)
    const node = createAiImageNode({ fwId: 'active-image', width: 240, height: 160 })

    await act(async () =>
      directRoot?.render(
        <GenerationUnit
          node={node}
          position={{ x: 0, y: 0 }}
          selected={false}
          active
          viewportScale={1}
          cumulativeRotation={0}
          onNodeAction={vi.fn()}
          onNodesDelete={vi.fn()}
        />,
      ),
    )

    expect(container.querySelector('[data-fw-node-toolbar]')).toBeNull()
  })

  it('用逆缩放与逆累计旋转保持固定屏幕像素且始终水平', async () => {
    const callbacks = createCallbacks()
    const { renderer, nodeElement } = await mountGenerationNode(
      createAiImageNode({
        fwId: 'rotated-image',
        width: 240,
        height: 160,
        rotation: 45,
      }),
      callbacks,
      { ...DEFAULT_VIEWPORT, scale: 0.3 },
    )

    const toolbar = await hoverNode(nodeElement)
    expect(toolbar.style.transform).toBe('scale(3.3333333333333335)')
    expect(toolbar.style.transformOrigin).toBe('bottom right')
    expect(toolbar.style.bottom).toBe('calc(100% + 26.6666666666667px)')

    await act(async () => renderer.destroy())
  })

  it('hover 时只挂载一个共享工具条，移入工具条保持、移到空白卸载', async () => {
    const callbacks = createCallbacks()
    const { renderer, nodeElement } = await mountGenerationNode(
      createAiImageNode({ fwId: 'empty-image', width: 240, height: 160 }),
      callbacks,
    )

    expect(nodeElement.dataset.fwGenerationUnit).toBe('true')
    expect(container!.querySelector('[data-fw-node-toolbar]')).toBeNull()

    const toolbar = await hoverNode(nodeElement)
    expect(toolbarButtons(toolbar)).toHaveLength(2)

    await act(async () =>
      toolbar.dispatchEvent(new MouseEvent('pointermove', { bubbles: true })),
    )
    expect(container!.querySelector('[data-fw-node-toolbar]')).toBe(toolbar)

    await act(async () =>
      container!.dispatchEvent(new MouseEvent('pointermove', { bubbles: true })),
    )
    expect(container!.querySelector('[data-fw-node-toolbar]')).toBeNull()

    await act(async () => renderer.destroy())
  })

  it('1000 个生成单元只注入一份样式且静态态不提前创建工具条按钮', async () => {
    const renderer = createDomRenderer()
    container = document.createElement('div')
    document.body.appendChild(container)
    const children = Array.from({ length: 1000 }, (_, index) =>
      createAiImageNode({
        fwId: `generated-image-${index}`,
        x: (index % 40) * 24,
        y: Math.floor(index / 40) * 24,
        width: 20,
        height: 20,
        status: 'succeeded',
        src: 'result.png',
      }),
    )

    await act(async () =>
      renderer.mount(container!, {
        root: createFrameNode({ fwId: 'root', width: 1000, height: 1000, children }),
        selection: [],
        viewport: DEFAULT_VIEWPORT,
        callbacks: createCallbacks(),
      }),
    )

    expect(container.querySelectorAll('style[data-fw-renderer-styles]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-fw-node-toolbar]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-fw-node-toolbar] button')).toHaveLength(0)
    expect(container.querySelectorAll('*')).toHaveLength(5007)

    const firstNode = container.querySelector('[data-fw-id="generated-image-0"]') as HTMLElement
    await hoverNode(firstNode)
    expect(container.querySelectorAll('style[data-fw-renderer-styles]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-fw-node-toolbar]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-fw-node-toolbar] button')).toHaveLength(3)
    expect(container.querySelectorAll('*')).toHaveLength(5013)

    await act(async () => renderer.destroy())
  }, 15_000)
})
