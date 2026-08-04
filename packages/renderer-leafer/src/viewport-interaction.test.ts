// @vitest-environment jsdom
// 🔴 任何 import leafer-ui 的测试文件必须把桩放在第一个 import（见桩内注释）
import './leafer-test-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_VIEWPORT,
  NOOP_RENDERER_CALLBACKS,
  canvasToScreen,
  createDemoDocument,
  screenToCanvas,
  type Viewport,
} from '@framewright/core'
import { createLeaferRenderer } from './index'
import { createViewportInteraction, type ViewportInteraction } from './viewport-interaction'

// 本套件与 renderer-dom/src/viewport-interaction.test.ts 逐行对齐——
// 同一手势两侧行为分歧会污染选型对照结论，测试也必须镜像。

let container: HTMLDivElement
let interaction: ViewportInteraction | null
let rafCallbacks: Map<number, FrameRequestCallback>
let nextRafId: number

function flushAnimationFrame(): void {
  const callbacks = [...rafCallbacks.values()]
  rafCallbacks.clear()
  for (const callback of callbacks) callback(16)
}

function dispatchWheel(init: WheelEventInit): WheelEvent {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
  container.dispatchEvent(event)
  return event
}

function dispatchPointer(type: string, init: MouseEventInit): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init })
  const target = type === 'pointerdown' ? container : window
  target.dispatchEvent(event)
  return event
}

function setup(initial: Viewport = { scale: 1, offsetX: 0, offsetY: 0 }) {
  const onViewportChange = vi.fn()
  const onPreview = vi.fn()
  interaction = createViewportInteraction(container, initial, { onViewportChange, onPreview })
  return { onViewportChange, onPreview }
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    x: 100,
    y: 50,
    left: 100,
    top: 50,
    right: 900,
    bottom: 500,
    width: 800,
    height: 450,
    toJSON: () => ({}),
  })
  interaction = null
  rafCallbacks = new Map()
  nextRafId = 1
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextRafId++
    rafCallbacks.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => rafCallbacks.delete(id))
})

afterEach(() => {
  interaction?.destroy()
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('滚轮视口交互', () => {
  it('普通滚轮按方向平移、阻止页面默认滚动并逐帧上报', () => {
    const { onViewportChange, onPreview } = setup()
    const event = dispatchWheel({ deltaX: 20, deltaY: 30 })

    expect(event.defaultPrevented).toBe(true)
    expect(onPreview).toHaveBeenCalledWith({ scale: 1, offsetX: -20, offsetY: -30 })
    expect(onViewportChange).not.toHaveBeenCalled()

    flushAnimationFrame()
    expect(onViewportChange).toHaveBeenCalledOnce()
    expect(onViewportChange).toHaveBeenCalledWith({ scale: 1, offsetX: -20, offsetY: -30 })
  })

  it('Shift + 纵向滚轮转换为水平平移', () => {
    const { onViewportChange } = setup()
    dispatchWheel({ deltaY: 40, shiftKey: true })
    flushAnimationFrame()
    expect(onViewportChange).toHaveBeenCalledWith({ scale: 1, offsetX: -40, offsetY: 0 })
  })

  it.each([{ ctrlKey: true }, { metaKey: true }])(
    'Ctrl/Cmd + 滚轮以容器内光标为锚点按 1.1 倍缩放',
    (modifier) => {
      const initial = { scale: 1, offsetX: 10, offsetY: -20 }
      const { onViewportChange } = setup(initial)
      const anchor = { x: 250, y: 150 }
      const canvasPoint = screenToCanvas(initial, anchor)

      dispatchWheel({ deltaY: -100, clientX: 350, clientY: 200, ...modifier })
      flushAnimationFrame()

      const next = onViewportChange.mock.calls[0]?.[0] as Viewport
      expect(next.scale).toBeCloseTo(1.1)
      expect(canvasToScreen(next, canvasPoint)).toEqual(anchor)
    },
  )

  it('连续缩放被钳制在 10%–400%', () => {
    const { onViewportChange } = setup()
    dispatchWheel({ deltaY: -100_000, ctrlKey: true })
    flushAnimationFrame()
    expect(onViewportChange.mock.calls[0]?.[0].scale).toBe(4)

    dispatchWheel({ deltaY: 100_000, ctrlKey: true })
    flushAnimationFrame()
    expect(onViewportChange.mock.calls[1]?.[0].scale).toBe(0.1)
  })
})

describe('拖拽平移状态机', () => {
  it('中键拖拽 1:1 平移并拦截 Windows 自动滚动默认行为', () => {
    const { onViewportChange } = setup()
    const down = dispatchPointer('pointerdown', { button: 1, clientX: 10, clientY: 20 })
    dispatchPointer('pointermove', { buttons: 4, clientX: 35, clientY: 12 })

    expect(down.defaultPrevented).toBe(true)
    expect(container.style.cursor).toBe('grabbing')
    flushAnimationFrame()
    expect(onViewportChange).toHaveBeenCalledWith({ scale: 1, offsetX: 25, offsetY: -8 })

    dispatchPointer('pointerup', { button: 1, clientX: 35, clientY: 12 })
    expect(container.style.cursor).toBe('')
  })

  it('空格按住 + 左键拖拽平移，松开空格恢复光标', () => {
    const { onViewportChange } = setup()
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }))
    expect(container.style.cursor).toBe('grab')

    dispatchPointer('pointerdown', { button: 0, clientX: 100, clientY: 100 })
    dispatchPointer('pointermove', { buttons: 1, clientX: 90, clientY: 130 })
    dispatchPointer('pointerup', { button: 0, clientX: 90, clientY: 130 })

    expect(onViewportChange).toHaveBeenCalledOnce()
    expect(onViewportChange).toHaveBeenCalledWith({ scale: 1, offsetX: -10, offsetY: 30 })
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }))
    expect(container.style.cursor).toBe('')
  })

  it('同一帧多次移动最多上报一次，pointerup 保证发出最终值', () => {
    const { onViewportChange } = setup()
    dispatchPointer('pointerdown', { button: 1, clientX: 0, clientY: 0 })
    dispatchPointer('pointermove', { buttons: 4, clientX: 10, clientY: 5 })
    dispatchPointer('pointermove', { buttons: 4, clientX: 20, clientY: 15 })

    expect(onViewportChange).not.toHaveBeenCalled()
    dispatchPointer('pointerup', { button: 1, clientX: 20, clientY: 15 })
    expect(onViewportChange).toHaveBeenCalledOnce()
    expect(onViewportChange).toHaveBeenCalledWith({ scale: 1, offsetX: 20, offsetY: 15 })
    flushAnimationFrame()
    expect(onViewportChange).toHaveBeenCalledOnce()
  })
})

describe('受控 viewport 回流', () => {
  it('host 回灌刚上报的相同 viewport 时相等性短路', () => {
    const { onViewportChange, onPreview } = setup()
    dispatchWheel({ deltaY: 100 })
    flushAnimationFrame()
    const reported = onViewportChange.mock.calls[0]?.[0] as Viewport

    interaction!.update(reported, onViewportChange)
    expect(onPreview).toHaveBeenCalledOnce()

    const external = { ...reported, offsetX: 25 }
    interaction!.update(external, onViewportChange)
    expect(onPreview).toHaveBeenCalledTimes(2)
    expect(onPreview).toHaveBeenLastCalledWith(external)
  })
})

describe('D1-leafer 挂载接线', () => {
  it('滚轮手势经 RAF 上报 host,回流相同 viewport 不重复上报', () => {
    const onViewportChange = vi.fn()
    const renderer = createLeaferRenderer()
    const ctx = {
      root: createDemoDocument(),
      selection: [],
      viewport: DEFAULT_VIEWPORT,
      callbacks: { ...NOOP_RENDERER_CALLBACKS, onViewportChange },
    }
    renderer.mount(container, ctx)

    dispatchWheel({ deltaY: 30 })
    flushAnimationFrame()
    expect(onViewportChange).toHaveBeenCalledOnce()
    expect(onViewportChange).toHaveBeenCalledWith({ scale: 1, offsetX: 0, offsetY: -30 })

    // 🔴 回流幂等：host 把刚上报的 viewport 回灌,不得引发新的上报（抖动回环）
    renderer.update({ ...ctx, viewport: { scale: 1, offsetX: 0, offsetY: -30 } })
    flushAnimationFrame()
    expect(onViewportChange).toHaveBeenCalledOnce()

    renderer.destroy()
  })
})
