import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CONNECTION_STYLE,
  DEFAULT_VIEWPORT,
  NOOP_RENDERER_CALLBACKS,
  createAiImageNode,
  createBoxNode,
  createDemoDocument,
  createFrameNode,
  type RenderContext,
} from '@framewright/core'
import { ConnectionLayer, collectConnectionItems } from './connections'
import { createDomRenderer } from './index'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

let container: HTMLElement | null = null

afterEach(async () => {
  container?.remove()
  container = null
})

async function mountRenderer(ctx: RenderContext) {
  container = document.createElement('div')
  document.body.appendChild(container)
  const renderer = createDomRenderer()
  await act(async () => renderer.mount(container!, ctx))
  return renderer
}

function demoContext(
  selection: readonly string[] = [],
  scale = DEFAULT_VIEWPORT.scale,
): RenderContext {
  return {
    root: createDemoDocument(),
    selection,
    viewport: { ...DEFAULT_VIEWPORT, scale },
    interactionMode: 'unified',
    callbacks: NOOP_RENDERER_CALLBACKS,
  }
}

describe('C2-dom collectConnectionItems', () => {
  it('demo 文档的两条连线精确使用共享贝塞尔曲线', () => {
    expect(collectConnectionItems(createDemoDocument())).toEqual([
      {
        fromFwId: 'ai-image-1',
        toFwId: 'ai-video-1',
        curve: {
          p0: { x: 600, y: 350 },
          c1: { x: 640, y: 350 },
          c2: { x: 580, y: 350 },
          p3: { x: 620, y: 350 },
        },
      },
      {
        fromFwId: 'ai-image-1',
        toFwId: 'ai-video-2',
        curve: {
          p0: { x: 600, y: 350 },
          c1: { x: 640, y: 350 },
          c2: { x: 590, y: 110 },
          p3: { x: 630, y: 110 },
        },
      },
    ])
  })

  it('悬空引用跳过且不影响其余连线', () => {
    const root = createFrameNode({
      fwId: 'root',
      children: [
        createBoxNode({ fwId: 'real', width: 20, height: 20 }),
        createAiImageNode({ fwId: 'gen', x: 100, sourceFwIds: ['ghost', 'real'] }),
      ],
    })
    const items = collectConnectionItems(root)
    expect(items).toHaveLength(1)
    expect(items[0]?.fromFwId).toBe('real')
  })
})

describe('C2-dom ConnectionLayer', () => {
  it('低数量连线保留逐条可寻址元素', async () => {
    const renderer = await mountRenderer(demoContext())
    const layer = container!.querySelector('[data-fw-connections]')!

    expect(layer.querySelectorAll('[data-fw-connection-from="ai-image-1"]')).toHaveLength(2)
    expect(layer.querySelectorAll('[data-fw-connection-strokes]')).toHaveLength(0)
    await act(async () => renderer.destroy())
  })

  it('512 条仍逐条可寻址，513 条开始合并为批量 path', async () => {
    const item = collectConnectionItems(createDemoDocument())[0]!
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const renderCount = async (count: number): Promise<void> => {
      await act(async () => root.render(
        <ConnectionLayer
          items={Array.from({ length: count }, () => item)}
          selection={[]}
          scale={1}
          rootBounds={{ x: 0, y: 0, width: 1_000, height: 1_000 }}
          detail="curve"
        />,
      ))
    }

    await renderCount(512)
    expect(container.querySelectorAll('[data-fw-connection-from]')).toHaveLength(512)
    expect(container.querySelectorAll('[data-fw-connection-strokes]')).toHaveLength(0)

    await renderCount(513)
    expect(container.querySelectorAll('[data-fw-connection-from]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-fw-connection-strokes]')).toHaveLength(1)
    expect(
      container.querySelector('[data-fw-connection-strokes]')?.getAttribute(
        'data-fw-connection-count',
      ),
    ).toBe('513')
    await act(async () => root.unmount())
  })

  it('SVG 是 root frame 的第一个孩子且画出两条曲线与四个端点', async () => {
    const renderer = await mountRenderer(demoContext())
    const root = container!.querySelector('[data-fw-id="root"]') as HTMLElement
    const layer = root.querySelector('[data-fw-connections]') as SVGSVGElement

    expect(root.firstElementChild).toBe(layer)
    expect(layer.style.pointerEvents).toBe('none')
    expect(layer.querySelectorAll('path')).toHaveLength(2)
    expect(layer.querySelectorAll('circle')).toHaveLength(4)
    expect(layer.querySelector('[data-fw-connection-to="ai-video-1"]')?.getAttribute('d')).toBe(
      'M 600 350 C 640 350, 580 350, 620 350',
    )
    expect(renderer.getRenderedBounds().has('__connections__')).toBe(false)
    await act(async () => renderer.destroy())
  })

  it('选中源节点时两条线高亮，线宽与端点半径按缩放反向补偿', async () => {
    const renderer = await mountRenderer(demoContext(['ai-image-1'], 4))
    const paths = container!.querySelectorAll('[data-fw-connection-from]')
    const dots = container!.querySelectorAll('[data-fw-connections] circle')

    expect(paths).toHaveLength(2)
    for (const path of paths) {
      expect(path.getAttribute('stroke')).toBe(CONNECTION_STYLE.highlightColor)
      expect(path.getAttribute('stroke-width')).toBe(String(CONNECTION_STYLE.highlightWidth / 4))
    }
    for (const dot of dots) {
      expect(dot.getAttribute('fill')).toBe(CONNECTION_STYLE.highlightColor)
      expect(dot.getAttribute('r')).toBe(String(CONNECTION_STYLE.endpointRadius / 4))
    }
    await act(async () => renderer.destroy())
  })

  it('simplified 档只用 p0 到 p3 的单个直线元素，不保留曲线与端点', async () => {
    const renderer = await mountRenderer(demoContext([], 0.25))
    const layer = container!.querySelector('[data-fw-connections]')!
    const lines = layer.querySelectorAll('[data-fw-connection-from]')

    expect(lines).toHaveLength(2)
    expect(layer.querySelector('[data-fw-connection-endpoints]')).toBeNull()
    expect(lines[0]?.getAttribute('x1')).toBe('600')
    expect(lines[0]?.getAttribute('x2')).toBe('620')

    await act(async () => renderer.destroy())
  })

  it('只选中一个派生节点时仅高亮对应连线', async () => {
    const renderer = await mountRenderer(demoContext(['ai-video-1']))
    const selected = container!.querySelector('[data-fw-connection-to="ai-video-1"]') as SVGPathElement
    const normal = container!.querySelector('[data-fw-connection-to="ai-video-2"]') as SVGPathElement

    expect(selected.getAttribute('stroke')).toBe(CONNECTION_STYLE.highlightColor)
    expect(normal.getAttribute('stroke')).toBe(CONNECTION_STYLE.strokeColor)
    await act(async () => renderer.destroy())
  })
})
