import { StrictMode, act, useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_VIEWPORT,
  GEN_UNIT_STYLE,
  NOOP_RENDERER_CALLBACKS,
  createAudioNode,
  createAiImageNode,
  createAiVideoNode,
  createDemoDocument,
  createFrameNode,
  createImgNode,
  createVideoNode,
  type RenderContext,
  type RendererCallbacks,
} from '@framewright/core'
import { createDomRenderer } from './index'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

function makeContext(selection: readonly string[] = []): RenderContext {
  return {
    root: createDemoDocument(),
    selection,
    viewport: DEFAULT_VIEWPORT,
    callbacks: NOOP_RENDERER_CALLBACKS,
  }
}

function normalizedCssColor(color: string): string {
  const element = document.createElement('div')
  element.style.color = color
  return element.style.color
}

function makeGenerationContext(
  callbacks: RendererCallbacks = NOOP_RENDERER_CALLBACKS,
): RenderContext {
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
        createAiVideoNode({
          fwId: 'succeeded-video',
          x: 530,
          y: 190,
          width: 240,
          height: 160,
          status: 'succeeded',
          src: '/fixtures/generated-preview.mp4',
        }),
      ],
    }),
    selection: [],
    viewport: DEFAULT_VIEWPORT,
    callbacks,
  }
}

function makeVideoContext(): RenderContext {
  return {
    root: createFrameNode({
      fwId: 'root',
      width: 800,
      height: 600,
      children: [
        createVideoNode({
          fwId: 'video-1',
          name: '预览视频',
          x: 12,
          y: 34,
          width: 320,
          height: 180,
          rotation: 5,
          opacity: 0.75,
          locked: true,
          src: '/fixtures/preview.mp4',
          poster: '/fixtures/poster.jpg',
          fit: 'cover',
        }),
      ],
    }),
    selection: [],
    viewport: DEFAULT_VIEWPORT,
    callbacks: NOOP_RENDERER_CALLBACKS,
  }
}

function makeImgContext(src = '/fixtures/reference.png'): RenderContext {
  return {
    root: createFrameNode({
      fwId: 'root',
      width: 800,
      height: 600,
      children: [
        createImgNode({
          fwId: 'img-1',
          name: '参考图片',
          x: 12,
          y: 34,
          width: 320,
          height: 180,
          rotation: 5,
          opacity: 0.75,
          locked: true,
          src,
          fit: 'cover',
        }),
      ],
    }),
    selection: [],
    viewport: DEFAULT_VIEWPORT,
    callbacks: NOOP_RENDERER_CALLBACKS,
  }
}

function makeAudioContext(src = '/fixtures/theme.mp3'): RenderContext {
  return {
    root: createFrameNode({
      fwId: 'root',
      width: 800,
      height: 600,
      children: [
        createAudioNode({
          fwId: 'audio-1',
          name: '主题音乐',
          x: 12,
          y: 34,
          width: 320,
          height: 120,
          rotation: 5,
          opacity: 0.75,
          locked: true,
          src,
        }),
      ],
    }),
    selection: [],
    viewport: DEFAULT_VIEWPORT,
    callbacks: NOOP_RENDERER_CALLBACKS,
  }
}

function makeInteractiveVideoContext(
  selection: readonly string[] = [],
  callbacks: RendererCallbacks = NOOP_RENDERER_CALLBACKS,
): RenderContext {
  return {
    root: createFrameNode({
      fwId: 'root',
      width: 800,
      height: 600,
      children: [
        createVideoNode({
          fwId: 'video-1',
          x: 12,
          y: 34,
          width: 320,
          height: 180,
          src: '/fixtures/preview.mp4',
          fit: 'cover',
        }),
      ],
    }),
    selection,
    viewport: DEFAULT_VIEWPORT,
    callbacks,
  }
}

function pointer(
  target: EventTarget,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  x: number,
  y: number,
): void {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: type === 'pointermove' ? -1 : 0,
      buttons: type === 'pointerup' ? 0 : 1,
      clientX: x,
      clientY: y,
    }),
  )
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

  it('img 有 src 时渲染原生图片并逐字段映射媒体与几何属性', async () => {
    const renderer = await mountRenderer(makeImgContext())
    const image = container!.querySelector('[data-fw-id="img-1"]') as HTMLImageElement

    expect(image).toBeInstanceOf(HTMLImageElement)
    expect(image.getAttribute('src')).toBe('/fixtures/reference.png')
    expect(image.style.objectFit).toBe('cover')
    expect(image.style.left).toBe('12px')
    expect(image.style.top).toBe('34px')
    expect(image.style.width).toBe('320px')
    expect(image.style.height).toBe('180px')
    expect(image.style.opacity).toBe('0.75')
    expect(image.style.transform).toBe('rotate(5deg)')
    expect(image.dataset.fwUnsupported).toBeUndefined()
    await act(async () => renderer.destroy())
  })

  it('img 无 src 时渲染稳定占位而不创建空图片请求', async () => {
    const renderer = await mountRenderer(makeImgContext(''))
    const placeholder = container!.querySelector('[data-fw-id="img-1"]') as HTMLElement

    expect(placeholder).toBeInstanceOf(HTMLDivElement)
    expect(placeholder.dataset.fwImagePlaceholder).toBe('true')
    expect(placeholder.dataset.fwUnsupported).toBeUndefined()
    expect(placeholder.querySelector('img')).toBeNull()
    await act(async () => renderer.destroy())
  })

  it('img 映射不向原生元素泄漏 node 业务字段', async () => {
    const renderer = await mountRenderer(makeImgContext())
    const image = container!.querySelector('[data-fw-id="img-1"]') as HTMLImageElement

    expect(image.getAttribute('fwId')).toBeNull()
    expect(image.getAttribute('fwType')).toBeNull()
    expect(image.getAttribute('locked')).toBeNull()
    expect(image.getAttribute('children')).toBeNull()
    expect(image.getAttribute('name')).toBeNull()
    await act(async () => renderer.destroy())
  })

  it('audio 有 src 时渲染深色卡片、名称与原生播放控件', async () => {
    const renderer = await mountRenderer(makeAudioContext())
    const card = container!.querySelector('[data-fw-id="audio-1"]') as HTMLElement
    const audio = card.querySelector('audio') as HTMLAudioElement

    expect(card).toBeInstanceOf(HTMLDivElement)
    expect(card.dataset.fwAudioCard).toBe('true')
    expect(card.dataset.fwAudioName).toBe('主题音乐')
    expect(card.style.left).toBe('12px')
    expect(card.style.top).toBe('34px')
    expect(card.style.width).toBe('320px')
    expect(card.style.height).toBe('120px')
    expect(card.style.opacity).toBe('0.75')
    expect(card.style.transform).toBe('rotate(5deg)')
    expect(audio).toBeInstanceOf(HTMLAudioElement)
    expect(audio.controls).toBe(true)
    expect(audio.preload).toBe('none')
    expect(audio.getAttribute('src')).toBe('/fixtures/theme.mp3')
    expect(audio.dataset.fwInteraction).toBe('ignore')
    expect(card.querySelectorAll('*')).toHaveLength(1)
    expect(container!.querySelectorAll('style[data-fw-renderer-styles="true"]')).toHaveLength(1)
    await act(async () => renderer.destroy())
  })

  it('audio 无 src 时渲染稳定占位，不创建空音频请求', async () => {
    const renderer = await mountRenderer(makeAudioContext(''))
    const placeholder = container!.querySelector('[data-fw-id="audio-1"]') as HTMLElement

    expect(placeholder.dataset.fwAudioPlaceholder).toBe('true')
    expect(placeholder.querySelector('audio')).toBeNull()
    await act(async () => renderer.destroy())
  })

  it('audio 映射不向 DOM 泄漏 node 内部字段', async () => {
    const renderer = await mountRenderer(makeAudioContext())
    const card = container!.querySelector('[data-fw-id="audio-1"]') as HTMLElement
    const audio = card.querySelector('audio') as HTMLAudioElement

    for (const element of [card, audio]) {
      expect(element.getAttribute('fwId')).toBeNull()
      expect(element.getAttribute('fwType')).toBeNull()
      expect(element.getAttribute('locked')).toBeNull()
      expect(element.getAttribute('children')).toBeNull()
      expect(element.getAttribute('name')).toBeNull()
    }
    await act(async () => renderer.destroy())
  })

  it('empty 生成单元渲染虚线外框与带交互忽略标记的生成按钮', async () => {
    const renderer = await mountRenderer(makeGenerationContext())
    const node = container!.querySelector('[data-fw-id="empty-image"]') as HTMLElement
    const button = node.querySelector('[data-fw-generation-surface] button') as HTMLButtonElement

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
    const generatedVideo = container!.querySelector(
      '[data-fw-id="succeeded-video"] video',
    ) as HTMLVideoElement
    expect(generatedVideo.preload).toBe('none')
    await act(async () => renderer.destroy())
  })

  it('failed 生成单元渲染兜底错误文案与带交互忽略标记的重试按钮', async () => {
    const renderer = await mountRenderer(makeGenerationContext())
    const node = container!.querySelector('[data-fw-id="failed-video"]') as HTMLElement
    const error = node.querySelector('[data-fw-generation-error]') as HTMLElement
    const button = node.querySelector('[data-fw-generation-surface] button') as HTMLButtonElement

    expect(node.style.borderColor).toBe(normalizedCssColor(GEN_UNIT_STYLE.failedBorderColor))
    expect(error.textContent).toBe('生成失败')
    expect(button.textContent).toBe('重试')
    expect(button.dataset.fwInteraction).toBe('ignore')
    expect(node.querySelector('[data-fw-generation-footer]')).toBeNull()
    await act(async () => renderer.destroy())
  })

  it('video 使用原生控件并逐字段映射媒体与几何属性', async () => {
    const renderer = await mountRenderer(makeVideoContext())
    const video = container!.querySelector('[data-fw-id="video-1"]') as HTMLVideoElement

    expect(video).toBeInstanceOf(HTMLVideoElement)
    expect(video.controls).toBe(true)
    expect(video.playsInline).toBe(true)
    expect(video.preload).toBe('none')
    expect(video.dataset.fwInteraction).toBeUndefined()
    expect(video.style.pointerEvents).toBe('none')
    expect(video.getAttribute('src')).toBe('/fixtures/preview.mp4')
    expect(video.getAttribute('poster')).toBe('/fixtures/poster.jpg')
    expect(video.style.objectFit).toBe('cover')
    expect(video.style.left).toBe('12px')
    expect(video.style.top).toBe('34px')
    expect(video.style.width).toBe('320px')
    expect(video.style.height).toBe('180px')
    expect(video.style.opacity).toBe('0.75')
    expect(video.style.transform).toBe('rotate(5deg)')
    expect(video.dataset.fwUnsupported).toBeUndefined()
    await act(async () => renderer.destroy())
  })

  it('video 映射不向原生元素泄漏 node 业务字段', async () => {
    const renderer = await mountRenderer(makeVideoContext())
    const video = container!.querySelector('[data-fw-id="video-1"]') as HTMLVideoElement

    expect(video.getAttribute('fwId')).toBeNull()
    expect(video.getAttribute('fwType')).toBeNull()
    expect(video.getAttribute('locked')).toBeNull()
    expect(video.getAttribute('children')).toBeNull()
    expect(video.getAttribute('name')).toBeNull()
    await act(async () => renderer.destroy())
  })

  it('video 默认归画布命中，激活后由原生控件接管，点空白退出激活', async () => {
    const callbacks: RendererCallbacks = {
      ...NOOP_RENDERER_CALLBACKS,
      onSelectionRequest: vi.fn(),
      onNodesMove: vi.fn(),
    }
    const renderer = await mountRenderer(makeInteractiveVideoContext([], callbacks))
    let video = container!.querySelector('[data-fw-id="video-1"]') as HTMLVideoElement

    expect(video.dataset.fwInteraction).toBeUndefined()
    expect(video.style.pointerEvents).toBe('none')

    await act(async () => {
      pointer(video, 'pointerdown', 20, 40)
      pointer(window, 'pointerup', 20, 40)
    })
    expect(callbacks.onSelectionRequest).toHaveBeenCalledWith(['video-1'], 'replace')

    await act(async () => renderer.update(makeInteractiveVideoContext(['video-1'], callbacks)))
    video = container!.querySelector('[data-fw-id="video-1"]') as HTMLVideoElement
    await act(async () => {
      pointer(video, 'pointerdown', 20, 40)
      pointer(window, 'pointermove', 30, 50)
      pointer(window, 'pointerup', 30, 50)
    })
    expect(callbacks.onNodesMove).toHaveBeenCalledOnce()

    await act(async () => {
      pointer(video, 'pointerdown', 20, 40)
      pointer(window, 'pointerup', 20, 40)
    })
    video = container!.querySelector('[data-fw-id="video-1"]') as HTMLVideoElement
    expect(video.dataset.fwInteraction).toBe('ignore')
    expect(video.style.pointerEvents).toBe('auto')

    await act(async () => {
      pointer(video, 'pointerdown', 20, 40)
      pointer(window, 'pointermove', 80, 40)
      pointer(window, 'pointerup', 80, 40)
    })
    expect(callbacks.onNodesMove).toHaveBeenCalledOnce()

    const rootNode = container!.querySelector('[data-fw-id="root"]') as HTMLElement
    await act(async () => {
      pointer(rootNode, 'pointerdown', 700, 500)
      pointer(window, 'pointerup', 700, 500)
    })
    video = container!.querySelector('[data-fw-id="video-1"]') as HTMLVideoElement
    expect(video.dataset.fwInteraction).toBeUndefined()
    expect(video.style.pointerEvents).toBe('none')

    await act(async () => renderer.destroy())
  })

  it.each([
    ['empty-image', 'generate'],
    ['failed-video', 'retry'],
  ])('内部按钮 %s 只上报 onNodeAction(%s)', async (fwId, action) => {
    const callbacks: RendererCallbacks = {
      onSelectionRequest: vi.fn(),
      onNodesMove: vi.fn(),
      onNodesResize: vi.fn(),
      onNodesDelete: vi.fn(),
      onViewportChange: vi.fn(),
      onNodeActivate: vi.fn(),
      onNodeAction: vi.fn(),
    }
    const renderer = await mountRenderer(makeGenerationContext(callbacks))
    const button = container!.querySelector(
      `[data-fw-id="${fwId}"] [data-fw-generation-surface] button`,
    ) as HTMLButtonElement

    await act(async () => button.click())

    expect(callbacks.onNodeAction).toHaveBeenCalledOnce()
    expect(callbacks.onNodeAction).toHaveBeenCalledWith(fwId, action)
    expect(callbacks.onSelectionRequest).not.toHaveBeenCalled()
    expect(callbacks.onNodesMove).not.toHaveBeenCalled()
    expect(callbacks.onNodesResize).not.toHaveBeenCalled()
    expect(callbacks.onNodesDelete).not.toHaveBeenCalled()
    expect(callbacks.onViewportChange).not.toHaveBeenCalled()
    expect(callbacks.onNodeActivate).not.toHaveBeenCalled()
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

  it('update 换上选中态后，描边由根级 overlay 绘制而不写入节点', async () => {
    const renderer = await mountRenderer(makeContext())
    await act(async () => renderer.update(makeContext(['box-front'])))
    const el = container!.querySelector('[data-fw-id="box-front"]') as HTMLElement
    expect(el.style.outline).toBe('')
    expect(container!.querySelector('[data-fw-selection-outline="single"]')).not.toBeNull()
    await act(async () => renderer.destroy())
  })

  it('单选显示四角缩放控制点，多选只保留选区而不显示控制点', async () => {
    const renderer = await mountRenderer(makeContext(['box-front']))
    await vi.waitFor(() => {
      expect(container!.querySelectorAll('[data-fw-resize-handle]')).toHaveLength(4)
    })

    await act(async () => renderer.update(makeContext(['box-front', 'box-back'])))
    await vi.waitFor(() => {
      expect(container!.querySelectorAll('[data-fw-resize-handle]')).toHaveLength(0)
    })
    await act(async () => renderer.destroy())
  })

  it('选中 overlay 按 1/viewport.scale 反向补偿描边与控制点', async () => {
    const zoomedIn = {
      ...makeContext(['box-front']),
      viewport: { scale: 4, offsetX: 0, offsetY: 0 },
    }
    const renderer = await mountRenderer(zoomedIn)
    const outline = container!.querySelector('[data-fw-selection-outline="single"]') as HTMLElement
    const handle = container!.querySelector('[data-fw-resize-handle="nw"]') as HTMLElement

    expect(outline.style.borderWidth).toBe('0.5px')
    expect(handle.style.width).toBe('2px')
    expect(handle.style.height).toBe('2px')

    await act(async () =>
      renderer.update({ ...zoomedIn, viewport: { scale: 0.25, offsetX: 0, offsetY: 0 } }),
    )
    expect(
      (container!.querySelector('[data-fw-selection-outline="single"]') as HTMLElement).style
        .borderWidth,
    ).toBe('8px')
    expect(
      (container!.querySelector('[data-fw-resize-handle="nw"]') as HTMLElement).style.width,
    ).toBe('32px')
    await act(async () => renderer.destroy())
  })

  it('多选只画联合包围框且不画控制点', async () => {
    const renderer = await mountRenderer(makeContext(['box-back', 'box-front']))
    const group = container!.querySelector('[data-fw-selection-outline="group"]') as HTMLElement

    expect({ left: group.style.left, top: group.style.top, width: group.style.width, height: group.style.height }).toEqual({
      left: '40px',
      top: '40px',
      width: '280px',
      height: '200px',
    })
    expect(container!.querySelectorAll('[data-fw-selection-outline]')).toHaveLength(1)
    expect(container!.querySelectorAll('[data-fw-resize-handle]')).toHaveLength(0)
    await act(async () => renderer.destroy())
  })

  it('hover 业务单元显示 1px 视觉描边，移到空白后消失', async () => {
    const renderer = await mountRenderer({
      ...makeContext(),
      viewport: { scale: 2, offsetX: 0, offsetY: 0 },
    })
    const node = container!.querySelector('[data-fw-id="box-front"]') as HTMLElement

    await act(async () => node.dispatchEvent(new MouseEvent('pointermove', { bubbles: true })))
    const hover = container!.querySelector('[data-fw-hover-outline]') as HTMLElement
    expect(hover.style.borderWidth).toBe('0.5px')

    await act(async () =>
      container!.dispatchEvent(new MouseEvent('pointermove', { bubbles: true })),
    )
    expect(container!.querySelector('[data-fw-hover-outline]')).toBeNull()
    await act(async () => renderer.destroy())
  })

  it('空格平移光标优先于节点 hover，pointercancel 后回到 grab，松键后复位', async () => {
    const renderer = await mountRenderer(makeContext())
    const node = container!.querySelector('[data-fw-id="box-front"]') as HTMLElement

    await act(async () => {
      node.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }))
    })
    expect(container!.style.cursor).toBe('move')

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }))
      container!.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
      )
      window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, buttons: 1 }))
    })
    expect(container!.style.cursor).toBe('grabbing')

    await act(async () => {
      window.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true }))
    })
    expect(container!.style.cursor).toBe('grab')

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }))
    })
    expect(container!.style.cursor).toBe('default')
    await act(async () => renderer.destroy())
  })

  it('原生 wheel 监听阻止默认滚动并把 viewport 逐帧上报给 host', async () => {
    let animationFrame: FrameRequestCallback | null = null
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      animationFrame = callback
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
    const onViewportChange = vi.fn()
    const callbacks = { ...NOOP_RENDERER_CALLBACKS, onViewportChange }
    const ctx = { ...makeContext(), callbacks }
    const renderer = await mountRenderer(ctx)
    const event = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })

    await act(async () => container!.dispatchEvent(event))
    expect(event.defaultPrevented).toBe(true)
    expect(onViewportChange).not.toHaveBeenCalled()

    await act(async () => animationFrame?.(16))
    expect(onViewportChange).toHaveBeenCalledWith({ scale: 1, offsetX: 0, offsetY: -100 })
    await act(async () => renderer.destroy())
  })
})
