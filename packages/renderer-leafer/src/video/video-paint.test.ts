// @vitest-environment jsdom
// 🔴 任何 import leafer-ui 的测试文件必须把桩放在第一个 import（见桩内注释）
import '../leafer-test-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Creator, PaintImage, Rect, Text } from 'leafer-ui'
import {
  attachVideoBinding,
  ensureVideoPaintRegistered,
  getOrCreateVideoSource,
  HtmlVideoImage,
  releaseVideoRegistryForTest,
  setVideoElementFactoryForTest,
  tickVideoBindings,
} from './video-paint'
import type { VideoElementLike } from './video-source'

// Leafer 集成层（C3-leafer）：
// ① Creator.video 工厂注册（开源版没有，付费插件 @leafer-in/video 才提供）
// ② HtmlVideoImage：把 HtmlVideoSource 接进 Leafer 的 paint 管线
// ③ 帧驱动：播放中逐帧 forceUpdate + 控件跟随

class FakeVideoElement implements VideoElementLike {
  src = ''
  loop = false
  volume = 1
  currentTime = 0
  duration = 8
  paused = true
  ended = false
  videoWidth = 640
  videoHeight = 360
  private listeners = new Map<string, Array<() => void>>()
  play(): void {
    this.paused = false
  }
  pause(): void {
    this.paused = true
  }
  addEventListener(type: string, cb: () => void): void {
    const list = this.listeners.get(type) ?? []
    list.push(cb)
    this.listeners.set(type, list)
  }
  removeEventListener(type: string, cb: () => void): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== cb))
  }
  emit(type: string): void {
    for (const cb of this.listeners.get(type) ?? []) cb()
  }
}

let fakeElement: FakeVideoElement

beforeEach(() => {
  ensureVideoPaintRegistered()
  fakeElement = new FakeVideoElement()
  setVideoElementFactoryForTest(() => fakeElement)
})

afterEach(() => {
  releaseVideoRegistryForTest()
})

describe('ensureVideoPaintRegistered', () => {
  it('补上开源版缺的两个洞：Creator.video 工厂 + PaintImage.video 钩子', () => {
    expect(typeof Creator.video).toBe('function')
    expect(typeof PaintImage.video).toBe('function')
  })

  it('Creator.video 产出 HtmlVideoImage', () => {
    const image = Creator.video!({ url: 'http://probe.local/a.webm' })
    expect(image).toBeInstanceOf(HtmlVideoImage)
  })
})

describe('HtmlVideoImage', () => {
  it('load 走播放源：loadeddata 后 ready，宽高取自视频流', async () => {
    const image = new HtmlVideoImage({ url: 'http://probe.local/a.webm' })
    const loaded = new Promise<void>((resolve, reject) => {
      image.load(() => resolve(), reject)
    })
    fakeElement.emit('loadeddata')
    await loaded
    expect(image.ready).toBe(true)
    expect(image.width).toBe(640)
    expect(image.height).toBe(360)
    expect(image.view).toBe(fakeElement)
  })

  it('同一 URL 共享一个播放源（播放状态跨 draw() 重建存活的关键）', () => {
    const first = getOrCreateVideoSource('http://probe.local/shared.webm')
    const second = getOrCreateVideoSource('http://probe.local/shared.webm')
    expect(first).toBe(second)
  })
})

describe('帧驱动 tickVideoBindings', () => {
  it('播放中 forceUpdate 画面，并按进度更新控件', async () => {
    const screen = new Rect({ x: 0, y: 0, width: 100, height: 100 })
    const progressFill = new Rect({ x: 0, y: 0, width: 0, height: 4 })
    const timeText = new Text({ x: 0, y: 0, width: 10, height: 10, text: '' })
    const forceUpdate = vi.spyOn(screen, 'forceUpdate').mockImplementation(() => {})

    const source = getOrCreateVideoSource('http://probe.local/b.webm')
    const loading = source.load()
    fakeElement.emit('loadeddata')
    await loading
    fakeElement.paused = false // 播放中
    fakeElement.currentTime = 4

    attachVideoBinding({
      screen,
      source,
      progressFill,
      progressTrackWidth: 200,
      timeText,
    })
    tickVideoBindings()

    expect(forceUpdate).toHaveBeenCalled()
    expect(progressFill.width).toBe(100) // 4s / 8s × 200
    expect(timeText.text).toBe('0:04 / 0:08')
  })

  it('暂停且进度未变时不重复 forceUpdate', async () => {
    const screen = new Rect({ x: 0, y: 0, width: 100, height: 100 })
    const forceUpdate = vi.spyOn(screen, 'forceUpdate').mockImplementation(() => {})

    const source = getOrCreateVideoSource('http://probe.local/c.webm')
    const loading = source.load()
    fakeElement.emit('loadeddata')
    await loading

    attachVideoBinding({ screen, source })
    tickVideoBindings()
    const callsAfterFirst = forceUpdate.mock.calls.length
    tickVideoBindings()
    expect(forceUpdate.mock.calls.length).toBe(callsAfterFirst)
  })

  it('暂停时 seek（进度变化）补画一帧——暂停态 seek 不落回画面的回归守护', async () => {
    const screen = new Rect({ x: 0, y: 0, width: 100, height: 100 })
    const forceUpdate = vi.spyOn(screen, 'forceUpdate').mockImplementation(() => {})

    const source = getOrCreateVideoSource('http://probe.local/d.webm')
    const loading = source.load()
    fakeElement.emit('loadeddata')
    await loading

    attachVideoBinding({ screen, source })
    tickVideoBindings() // 首帧
    forceUpdate.mockClear()

    fakeElement.currentTime = 5 // 暂停态 seek
    tickVideoBindings()
    expect(forceUpdate).toHaveBeenCalled()
  })
})
