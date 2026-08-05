import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { observeViewportSize } from './renderer-host-viewport-size'

describe('RendererHost 容器尺寸', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('初次测量容器，并把同一帧内的 resize 合并成一次尺寸更新', () => {
    let resize: ResizeObserverCallback | undefined
    const disconnect = vi.fn()
    const observe = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback
        }

        observe = observe
        disconnect = disconnect
      },
    )

    const frames = new Map<number, FrameRequestCallback>()
    let nextFrameId = 1
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      const frameId = nextFrameId++
      frames.set(frameId, callback)
      return frameId
    })
    const cancelAnimationFrame = vi.fn((frameId: number) => {
      frames.delete(frameId)
    })
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)

    const element = { clientWidth: 800, clientHeight: 450 } as HTMLElement
    const onSize = vi.fn()
    const stop = observeViewportSize(element, onSize)

    expect(observe).toHaveBeenCalledWith(element)
    expect(onSize).toHaveBeenCalledTimes(1)
    expect(onSize).toHaveBeenLastCalledWith({ width: 800, height: 450 })

    Object.defineProperties(element, {
      clientWidth: { value: 1200, configurable: true },
      clientHeight: { value: 700, configurable: true },
    })
    resize?.([], {} as ResizeObserver)
    resize?.([], {} as ResizeObserver)

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(onSize).toHaveBeenCalledTimes(1)

    const [[frameId, frame]] = frames.entries()
    frames.delete(frameId)
    frame(0)

    expect(onSize).toHaveBeenCalledTimes(2)
    expect(onSize).toHaveBeenLastCalledWith({ width: 1200, height: 700 })

    resize?.([], {} as ResizeObserver)
    const [[pendingFrameId]] = frames.entries()
    stop()

    expect(disconnect).toHaveBeenCalledOnce()
    expect(cancelAnimationFrame).toHaveBeenCalledWith(pendingFrameId)
  })

  it('把测得尺寸传进 RenderContext，使 resize 发布后走既有 renderer.update 通道', () => {
    const source = readFileSync(new URL('./renderer-host.tsx', import.meta.url), 'utf8')

    expect(source).toContain('observeViewportSize(container, setViewportSize)')
    expect(source).toMatch(
      /const ctx: RenderContext = \{[\s\S]*viewportSize: viewportSize \?\? DEFAULT_VIEWPORT_SIZE,[\s\S]*callbacks,[\s\S]*\}/,
    )
    expect(source).toContain('adapterRef.current?.update(ctx)')
  })
})
