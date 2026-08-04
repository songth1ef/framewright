import { StrictMode, act, useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_VIEWPORT,
  GEN_UNIT_STYLE,
  createAiImageNode,
  createAiVideoNode,
  createDemoDocument,
  createFrameNode,
  type RenderContext,
} from '@framewright/core'
import { createDomRenderer } from './index'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

function makeContext(selection: readonly string[] = []): RenderContext {
  return { root: createDemoDocument(), selection, viewport: DEFAULT_VIEWPORT }
}

function normalizedCssColor(color: string): string {
  const element = document.createElement('div')
  element.style.color = color
  return element.style.color
}

function makeGenerationContext(): RenderContext {
  return {
    root: createFrameNode({
      fwId: 'root',
      width: 800,
      height: 600,
      children: [
        createAiImageNode({
          fwId: 'empty-image',
          x: 10,
          y: 10,
          width: 240,
          height: 160,
          status: 'empty',
        }),
        createAiVideoNode({
          fwId: 'pending-video',
          x: 270,
          y: 10,
          width: 240,
          height: 160,
          status: 'pending',
        }),
        createAiImageNode({
          fwId: 'running-image',
          x: 530,
          y: 10,
          width: 240,
          height: 160,
          status: 'running',
        }),
        createAiImageNode({
          fwId: 'succeeded-image',
          x: 10,
          y: 190,
          width: 240,
          height: 160,
          status: 'succeeded',
          src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
          prompt: 'a deliberately long prompt that must stay on one line and be truncated',
          fit: 'cover',
        }),
        createAiVideoNode({
          fwId: 'failed-video',
          x: 270,
          y: 190,
          width: 240,
          height: 160,
          status: 'failed',
          errorMessage: null,
        }),
      ],
    }),
    selection: [],
    viewport: DEFAULT_VIEWPORT,
  }
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

  it('empty 生成单元渲染虚线外框与带交互忽略标记的生成按钮', async () => {
    const renderer = await mountRenderer(makeGenerationContext())
    const node = container!.querySelector('[data-fw-id="empty-image"]') as HTMLElement
    const button = node.querySelector('button') as HTMLButtonElement

    expect(node.dataset.fwUnsupported).toBeUndefined()
    expect(node.style.borderStyle).toBe('dashed')
    expect(node.style.borderColor).toBe(normalizedCssColor(GEN_UNIT_STYLE.borderColor))
    expect(button.textContent).toBe('点击生成')
    expect(button.dataset.fwInteraction).toBe('ignore')
    expect(node.querySelector('[data-fw-generation-footer]')).toBeNull()
    await act(async () => renderer.destroy())
  })

  it('pending 与 running 都用占满节点完整尺寸的骨架屏并贴底显示进度条', async () => {
    const renderer = await mountRenderer(makeGenerationContext())

    for (const fwId of ['pending-video', 'running-image']) {
      const node = container!.querySelector(`[data-fw-id="${fwId}"]`) as HTMLElement
      const skeleton = node.querySelector('[data-fw-generation-skeleton]') as HTMLElement
      const progress = node.querySelector('[data-fw-generation-progress]') as HTMLElement
      expect(skeleton.style.width).toBe('100%')
      expect(skeleton.style.height).toBe('100%')
      expect(skeleton.style.background).toBe(normalizedCssColor(GEN_UNIT_STYLE.skeletonBase))
      expect(skeleton.style.animationDuration).toBe(`${GEN_UNIT_STYLE.skeletonPeriodMs}ms`)
      expect(progress.style.height).toBe(`${GEN_UNIT_STYLE.progressHeight}px`)
      expect(progress.style.bottom).toBe('0px')
    }

    await act(async () => renderer.destroy())
  })

  it('succeeded 生成单元渲染素材、单行 footer 与 AI生成徽标', async () => {
    const renderer = await mountRenderer(makeGenerationContext())
    const node = container!.querySelector('[data-fw-id="succeeded-image"]') as HTMLElement
    const media = node.querySelector('img') as HTMLImageElement
    const footer = node.querySelector('[data-fw-generation-footer]') as HTMLElement
    const badge = node.querySelector('[data-fw-generation-badge]') as HTMLElement

    expect(media.style.height).toBe(`calc(100% - ${GEN_UNIT_STYLE.footerHeight}px)`)
    expect(media.style.objectFit).toBe('cover')
    expect(footer.textContent).toContain('a deliberately long prompt')
    expect(footer.style.height).toBe(`${GEN_UNIT_STYLE.footerHeight}px`)
    expect(footer.style.whiteSpace).toBe('nowrap')
    expect(footer.style.textOverflow).toBe('ellipsis')
    expect(badge.textContent).toBe('AI生成')
    expect(badge.style.left).toBe(`${GEN_UNIT_STYLE.badgeInset}px`)
    expect(badge.style.top).toBe(`${GEN_UNIT_STYLE.badgeInset}px`)
    await act(async () => renderer.destroy())
  })

  it('failed 生成单元渲染兜底错误文案与带交互忽略标记的重试按钮', async () => {
    const renderer = await mountRenderer(makeGenerationContext())
    const node = container!.querySelector('[data-fw-id="failed-video"]') as HTMLElement
    const error = node.querySelector('[data-fw-generation-error]') as HTMLElement
    const button = node.querySelector('button') as HTMLButtonElement

    expect(node.style.borderColor).toBe(normalizedCssColor(GEN_UNIT_STYLE.failedBorderColor))
    expect(error.textContent).toBe('生成失败')
    expect(button.textContent).toBe('重试')
    expect(button.dataset.fwInteraction).toBe('ignore')
    expect(node.querySelector('[data-fw-generation-footer]')).toBeNull()
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
