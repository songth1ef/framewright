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
): Promise<{ renderer: ReturnType<typeof createDomRenderer>; toolbar: HTMLElement }> {
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
    toolbar: container.querySelector(`[data-fw-id="${node.fwId}"] [data-fw-node-toolbar]`)!,
  }
}

function toolbarButtons(toolbar: HTMLElement): HTMLButtonElement[] {
  return [...toolbar.querySelectorAll<HTMLButtonElement>('button')]
}

/**
 * 取「重新生成 / 下载 / 删除」三个按钮。
 *
 * 直接解构 `toolbarButtons(...)` 在 `noUncheckedIndexedAccess` 下每个元素都是
 * `HTMLButtonElement | undefined`，会让后续每一行断言都要判空。这里先断言数量再取，
 * 既收窄了类型，也让「工具条按钮数量变了」这件事以一条清晰的失败信息暴露出来，
 * 而不是变成一串 `Cannot read property of undefined`。
 */
function expectThreeToolbarButtons(
  toolbar: HTMLElement,
): [HTMLButtonElement, HTMLButtonElement, HTMLButtonElement] {
  const buttons = toolbarButtons(toolbar)
  if (buttons.length !== 3) {
    throw new Error(`期望工具条有 3 个按钮（重新生成/下载/删除），实际 ${buttons.length} 个`)
  }
  return [buttons[0]!, buttons[1]!, buttons[2]!]
}

describe('生成单元 hover 业务工具条', () => {
  it('重新生成与下载走 NODE_ACTIONS，删除只走 onNodesDelete 专用通道', async () => {
    const callbacks = createCallbacks()
    const { renderer, toolbar } = await mountGenerationNode(
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
    ['empty', '生成', false, true, NODE_ACTIONS.generate],
    ['pending', '生成', true, true, NODE_ACTIONS.generate],
    ['running', '生成', true, true, NODE_ACTIONS.generate],
    ['succeeded', '重新生成', false, false, NODE_ACTIONS.regenerate],
    ['failed', '重试', false, true, NODE_ACTIONS.retry],
  ] as const)('%s 状态按节点自身状态设置生成与下载可用性', async (status, label, generateDisabled, downloadDisabled, expectedAction) => {
    const callbacks = createCallbacks()
    const { renderer, toolbar } = await mountGenerationNode(
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
    const [generate, download, remove] = expectThreeToolbarButtons(toolbar)

    expect(generate.textContent).toBe(label)
    expect(generate.disabled).toBe(generateDisabled)
    expect(download.disabled).toBe(downloadDisabled)
    expect(remove.disabled).toBe(false)
    for (const button of [generate, download]) {
      expect(button.style.opacity).toBe(button.disabled ? '0.38' : '1')
      expect(button.style.cursor).toBe(button.disabled ? 'not-allowed' : 'pointer')
    }
    await act(async () => generate.click())
    if (generateDisabled) {
      expect(callbacks.onNodeAction).not.toHaveBeenCalled()
    } else {
      expect(callbacks.onNodeAction).toHaveBeenCalledWith(`image-${status}`, expectedAction)
    }

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
    const { renderer, toolbar } = await mountGenerationNode(
      createAiImageNode({
        fwId: 'rotated-image',
        width: 240,
        height: 160,
        rotation: 45,
      }),
      callbacks,
      { ...DEFAULT_VIEWPORT, scale: 0.3 },
    )

    expect(toolbar.style.transform).toBe('rotate(-45deg) scale(3.3333333333333335)')
    expect(toolbar.style.transformOrigin).toBe('bottom right')
    expect(toolbar.style.bottom).toBe('calc(100% + 26.6666666666667px)')

    await act(async () => renderer.destroy())
  })

  it('用 CSS hover 控制显隐，不把 hover 状态写入渲染器或 node 树', async () => {
    const callbacks = createCallbacks()
    const { renderer, toolbar } = await mountGenerationNode(
      createAiImageNode({ fwId: 'empty-image', width: 240, height: 160 }),
      callbacks,
    )
    const node = container!.querySelector('[data-fw-id="empty-image"]') as HTMLElement
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
