import {
  DEFAULT_VIEWPORT,
  NOOP_RENDERER_CALLBACKS,
  createFrameNode,
  createVideoNode,
  type RenderContext,
} from '@framewright/core'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDomRenderer } from './index'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

const playing = new WeakMap<HTMLMediaElement, boolean>()
let container: HTMLDivElement | null = null
let pausedDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  pausedDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'paused')
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
    configurable: true,
    get() {
      return !(playing.get(this) ?? false)
    },
  })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play(
    this: HTMLMediaElement,
  ) {
    playing.set(this, true)
    return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function pause(
    this: HTMLMediaElement,
  ) {
    playing.set(this, false)
  })
})

afterEach(() => {
  container?.remove()
  container = null
  vi.restoreAllMocks()
  if (pausedDescriptor !== undefined) {
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', pausedDescriptor)
  }
})

function context(viewport = DEFAULT_VIEWPORT): RenderContext {
  return {
    root: createFrameNode({
      fwId: 'root',
      width: 1_000,
      height: 1_000,
      children: [
        createVideoNode({
          fwId: 'video-1',
          x: 10,
          y: 10,
          width: 320,
          height: 180,
          src: '/fixtures/preview.mp4',
        }),
      ],
    }),
    selection: [],
    viewport,
    interactionMode: 'unified',
    callbacks: NOOP_RENDERER_CALLBACKS,
  }
}

async function mount(ctx = context()) {
  container = document.createElement('div')
  Object.defineProperties(container, {
    clientWidth: { configurable: true, value: 800 },
    clientHeight: { configurable: true, value: 600 },
  })
  document.body.appendChild(container)
  const renderer = createDomRenderer()
  await act(async () => renderer.mount(container!, ctx))
  return renderer
}

async function startAt(seconds: number, paused: boolean): Promise<HTMLVideoElement> {
  const video = container!.querySelector('video')!
  video.currentTime = seconds
  if (paused) {
    video.pause()
    video.dispatchEvent(new Event('pause'))
  } else {
    await video.play()
    video.dispatchEvent(new Event('play'))
    video.dispatchEvent(new Event('timeupdate'))
  }
  return video
}

describe('DOM 视频会话连续性', () => {
  it('离屏再回来恢复播放位置与播放态，同时仍销毁旧 video 元素', async () => {
    const renderer = await mount()
    const before = await startAt(4.25, false)

    await act(async () => renderer.update(context({ scale: 1, offsetX: 0, offsetY: -2_000 })))
    expect(container!.querySelector('video')).toBeNull()

    await act(async () => renderer.update(context()))
    const after = container!.querySelector('video')!
    expect(after).not.toBe(before)
    expect(after.currentTime).toBe(4.25)
    expect(after.paused).toBe(false)

    await act(async () => renderer.destroy())
  })

  it('从 dot 档回 full 恢复播放位置', async () => {
    const renderer = await mount()
    await startAt(7.5, false)

    await act(async () => renderer.update(context({ scale: 0.1, offsetX: 0, offsetY: 0 })))
    expect(container!.querySelector('video')).toBeNull()
    await act(async () => renderer.update(context()))

    expect(container!.querySelector('video')!.currentTime).toBe(7.5)
    await act(async () => renderer.destroy())
  })

  it('原本暂停的视频回来后仍暂停', async () => {
    const renderer = await mount()
    await startAt(2.75, true)

    await act(async () => renderer.update(context({ scale: 0.2, offsetX: 0, offsetY: 0 })))
    await act(async () => renderer.update(context()))

    const after = container!.querySelector('video')!
    expect(after.currentTime).toBe(2.75)
    expect(after.paused).toBe(true)
    await act(async () => renderer.destroy())
  })

  it('adapter 销毁并切回 DOM 后仍从 host 回调通道恢复位置', async () => {
    const sharedContext = context()
    const first = await mount(sharedContext)
    await startAt(9.125, false)
    await act(async () => first.destroy())

    const second = createDomRenderer()
    await act(async () => second.mount(container!, sharedContext))
    const restored = container!.querySelector('video')!
    expect(restored.currentTime).toBe(9.125)
    expect(restored.paused).toBe(false)
    await act(async () => second.destroy())
  })
})
