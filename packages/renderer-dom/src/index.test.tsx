import { StrictMode, act, useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_VIEWPORT, createDemoDocument, type RenderContext } from '@framewright/core'
import { createDomRenderer } from './index'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

function makeContext(selection: readonly string[] = []): RenderContext {
  return { root: createDemoDocument(), selection, viewport: DEFAULT_VIEWPORT }
}

let container: HTMLElement | null = null
let hostRoot: Root | null = null

afterEach(async () => {
  if (hostRoot !== null) {
    await act(async () => hostRoot?.unmount())
  }
  hostRoot = null
  container?.remove()
  container = null
  vi.restoreAllMocks()
})

async function mountRenderer(ctx: RenderContext) {
  container = document.createElement('div')
  document.body.appendChild(container)
  const renderer = createDomRenderer()
  await act(async () => renderer.mount(container!, ctx))
  return renderer
}

describe('createDomRenderer', () => {
  it('从 React effect 挂载时不强制同步提交', async () => {
    const errors: string[] = []
    vi.spyOn(console, 'error').mockImplementation((message) => {
      errors.push(String(message))
    })

    function Host() {
      const targetRef = useRef<HTMLDivElement>(null)
      useEffect(() => {
        const target = targetRef.current
        if (target === null) return
        const renderer = createDomRenderer()
        renderer.mount(target, makeContext())
        return () => renderer.destroy()
      }, [])
      return <div ref={targetRef} />
    }

    container = document.createElement('div')
    document.body.appendChild(container)
    hostRoot = createRoot(container)
    await act(async () => hostRoot?.render(<StrictMode><Host /></StrictMode>))

    expect(errors.some((message) => message.includes('flushSync was called'))).toBe(false)
  })

  it('id 与 displayName 固定', () => {
    const renderer = createDomRenderer()
    expect(renderer.id).toBe('dom')
    expect(renderer.displayName).toBe('HTML / DOM')
  })

  it('mount 后每个节点都有对应 DOM 元素', async () => {
    const renderer = await mountRenderer(makeContext())
    expect(container!.querySelector('[data-fw-id="box-back"]')).not.toBeNull()
    expect(container!.querySelector('[data-fw-id="nested-box"]')).not.toBeNull()
    await act(async () => renderer.destroy())
  })

  it('img/video 渲染为显式的 unsupported 占位', async () => {
    const renderer = await mountRenderer(makeContext())
    expect(
      container!.querySelector('[data-fw-id="img-1"][data-fw-unsupported="true"]'),
    ).not.toBeNull()
    await act(async () => renderer.destroy())
  })

  it('getRenderedBounds 报告绝对坐标，嵌套节点已累加父偏移', async () => {
    const renderer = await mountRenderer(makeContext())
    const bounds = renderer.getRenderedBounds()
    // inner-frame(380,60) > nested-box(20,20) → (400,80)
    expect(bounds.get('nested-box')).toEqual({ x: 400, y: 80, width: 120, height: 80 })
    await act(async () => renderer.destroy())
  })

  it('嵌套节点用相对父 frame 的坐标定位', async () => {
    const renderer = await mountRenderer(makeContext())
    const nested = container!.querySelector('[data-fw-id="nested-box"]') as HTMLElement
    expect({ left: nested.style.left, top: nested.style.top }).toEqual({
      left: '20px',
      top: '20px',
    })
    await act(async () => renderer.destroy())
  })

  it('destroy 后容器清空', async () => {
    const renderer = await mountRenderer(makeContext())
    await act(async () => renderer.destroy())
    expect(container!.innerHTML).toBe('')
    expect(renderer.getRenderedBounds().size).toBe(0)
  })

  it('update 换上选中态后，被选中节点带 outline', async () => {
    const renderer = await mountRenderer(makeContext())
    await act(async () => renderer.update(makeContext(['box-front'])))
    const el = container!.querySelector('[data-fw-id="box-front"]') as HTMLElement
    expect(el.style.outline).toContain('#5B8091')
    await act(async () => renderer.destroy())
  })
})
