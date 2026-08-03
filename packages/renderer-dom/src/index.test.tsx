import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_VIEWPORT, createDemoDocument, type RenderContext } from '@framewright/core'
import { createDomRenderer } from './index'

function makeContext(selection: readonly string[] = []): RenderContext {
  return { root: createDemoDocument(), selection, viewport: DEFAULT_VIEWPORT }
}

let container: HTMLElement | null = null

afterEach(() => {
  container?.remove()
  container = null
})

function mountRenderer(ctx: RenderContext) {
  container = document.createElement('div')
  document.body.appendChild(container)
  const renderer = createDomRenderer()
  renderer.mount(container, ctx)
  return renderer
}

describe('createDomRenderer', () => {
  it('id 与 displayName 固定', () => {
    const renderer = createDomRenderer()
    expect(renderer.id).toBe('dom')
    expect(renderer.displayName).toBe('HTML / DOM')
  })

  it('mount 后每个节点都有对应 DOM 元素', async () => {
    const renderer = mountRenderer(makeContext())
    await Promise.resolve()
    expect(container!.querySelector('[data-fw-id="box-back"]')).not.toBeNull()
    expect(container!.querySelector('[data-fw-id="nested-box"]')).not.toBeNull()
    renderer.destroy()
  })

  it('img/video 渲染为显式的 unsupported 占位', async () => {
    const renderer = mountRenderer(makeContext())
    await Promise.resolve()
    expect(
      container!.querySelector('[data-fw-id="img-1"][data-fw-unsupported="true"]'),
    ).not.toBeNull()
    renderer.destroy()
  })

  it('getRenderedBounds 报告绝对坐标，嵌套节点已累加父偏移', async () => {
    const renderer = mountRenderer(makeContext())
    await Promise.resolve()
    const bounds = renderer.getRenderedBounds()
    // inner-frame(380,60) > nested-box(20,20) → (400,80)
    expect(bounds.get('nested-box')).toEqual({ x: 400, y: 80, width: 120, height: 80 })
    renderer.destroy()
  })

  it('destroy 后容器清空', async () => {
    const renderer = mountRenderer(makeContext())
    await Promise.resolve()
    renderer.destroy()
    await Promise.resolve()
    expect(container!.innerHTML).toBe('')
    expect(renderer.getRenderedBounds().size).toBe(0)
  })

  it('update 换上选中态后，被选中节点带 outline', async () => {
    const renderer = mountRenderer(makeContext())
    await Promise.resolve()
    renderer.update(makeContext(['box-front']))
    await Promise.resolve()
    const el = container!.querySelector('[data-fw-id="box-front"]') as HTMLElement
    expect(el.style.outline).toContain('#5B8091')
    renderer.destroy()
  })
})
