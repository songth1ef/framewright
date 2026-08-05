import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  NOOP_RENDERER_CALLBACKS,
  createAiImageNode,
  createAiVideoNode,
  createBoxNode,
  createFrameNode,
  createVideoNode,
  type RenderContext,
  type Viewport,
} from '@framewright/core'
import { createDomRenderer } from './index'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

let container: HTMLElement | null = null

afterEach(() => {
  container?.remove()
  container = null
})

function makeContext(
  children: Parameters<typeof createFrameNode>[0]['children'],
  viewport: Viewport = { scale: 1, offsetX: 0, offsetY: 0 },
): RenderContext {
  return {
    root: createFrameNode({ fwId: 'root', width: 1_000, height: 1_000, children }),
    selection: [],
    viewport,
    callbacks: NOOP_RENDERER_CALLBACKS,
  }
}

async function mount(ctx: RenderContext) {
  container = document.createElement('div')
  Object.defineProperties(container, {
    clientWidth: { configurable: true, value: 100 },
    clientHeight: { configurable: true, value: 100 },
  })
  document.body.appendChild(container)
  const renderer = createDomRenderer()
  await act(async () => renderer.mount(container!, ctx))
  return renderer
}

describe('DOM 视口裁剪', () => {
  it('只挂载扩展视口内节点，但 Adapter 的全量 bounds 与 visible 语义不变', async () => {
    const ctx = makeContext([
      createBoxNode({ fwId: 'left', x: 10, y: 10, width: 20, height: 20 }),
      createBoxNode({ fwId: 'overlap', x: 150, y: 10, width: 20, height: 20 }),
      createBoxNode({ fwId: 'far', x: 350, y: 10, width: 20, height: 20 }),
    ])
    const renderer = await mount(ctx)

    expect(container!.querySelector('[data-fw-id="left"]')).not.toBeNull()
    expect(container!.querySelector('[data-fw-id="overlap"]')).not.toBeNull()
    expect(container!.querySelector('[data-fw-id="far"]')).toBeNull()
    expect(renderer.getRenderedBounds().has('far')).toBe(true)
    expect(renderer.getVisibleNodeIds()).toEqual(['root', 'left', 'overlap', 'far'])

    await act(async () => renderer.destroy())
  })

  it('平移后增量增删，保留集合内节点与根容器不会重建', async () => {
    const children = [
      createBoxNode({ fwId: 'left', x: 10, y: 10, width: 20, height: 20 }),
      createBoxNode({ fwId: 'overlap', x: 150, y: 10, width: 20, height: 20 }),
      createBoxNode({ fwId: 'far', x: 350, y: 10, width: 20, height: 20 }),
    ]
    const renderer = await mount(makeContext(children))
    const rootBefore = container!.querySelector('[data-fw-id="root"]')
    const overlapBefore = container!.querySelector('[data-fw-id="overlap"]')

    await act(async () =>
      renderer.update(makeContext(children, { scale: 1, offsetX: -200, offsetY: 0 })),
    )

    expect(container!.querySelector('[data-fw-id="left"]')).toBeNull()
    expect(container!.querySelector('[data-fw-id="far"]')).not.toBeNull()
    expect(container!.querySelector('[data-fw-id="root"]')).toBe(rootBefore)
    expect(container!.querySelector('[data-fw-id="overlap"]')).toBe(overlapBefore)

    await act(async () => renderer.destroy())
  })

  it('连线按 core 的贝塞尔曲线包围盒裁剪，不用端点代替', async () => {
    const renderer = await mount(
      makeContext([
        createBoxNode({ fwId: 'cross-source', x: -220, y: 40, width: 20, height: 20 }),
        createAiImageNode({
          fwId: 'cross-target',
          x: 300,
          y: 40,
          width: 20,
          height: 20,
          sourceFwIds: ['cross-source'],
        }),
        createBoxNode({ fwId: 'far-source', x: -220, y: 400, width: 20, height: 20 }),
        createAiImageNode({
          fwId: 'far-target',
          x: 300,
          y: 400,
          width: 20,
          height: 20,
          sourceFwIds: ['far-source'],
        }),
      ]),
    )

    const paths = container!.querySelectorAll('[data-fw-connections] path')
    expect(paths).toHaveLength(1)
    expect(paths[0]?.getAttribute('data-fw-connection-from')).toBe('cross-source')
    expect(paths[0]?.getAttribute('data-fw-connection-to')).toBe('cross-target')

    await act(async () => renderer.destroy())
  })

  it('overscan 内但真实视口外的纯视频与生成视频延迟挂载 video', async () => {
    const children = [
      createVideoNode({
        fwId: 'video',
        x: 150,
        y: 10,
        width: 20,
        height: 20,
        src: '/fixtures/preview.mp4',
      }),
      createAiVideoNode({
        fwId: 'ai-video',
        x: 150,
        y: 40,
        width: 20,
        height: 20,
        status: 'succeeded',
        src: '/fixtures/generated-preview.mp4',
      }),
    ]
    const renderer = await mount(makeContext(children))

    expect(container!.querySelector('[data-fw-id="video"]')).not.toBeNull()
    expect(container!.querySelector('[data-fw-id="ai-video"]')).not.toBeNull()
    expect(container!.querySelectorAll('video')).toHaveLength(0)

    await act(async () =>
      renderer.update(makeContext(children, { scale: 1, offsetX: -100, offsetY: 0 })),
    )
    expect(container!.querySelectorAll('video')).toHaveLength(2)

    await act(async () => renderer.destroy())
  })
})
