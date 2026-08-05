import { describe, expect, it } from 'vitest'
import { HtmlVideoSource, type VideoElementLike } from './video-source'

// 播放源状态机（C3-leafer）：与 DOM 解耦，单测用假 video 元素驱动。
// 真实 HTMLVideoElement 的行为由真实浏览器 probe 负责验证。

class FakeVideoElement implements VideoElementLike {
  src = ''
  loop = false
  volume = 1
  currentTime = 0
  duration = 12
  paused = true
  ended = false
  videoWidth = 640
  videoHeight = 360
  playCalls = 0
  pauseCalls = 0
  private listeners = new Map<string, Array<() => void>>()

  play(): void {
    this.playCalls += 1
    this.paused = false
  }
  pause(): void {
    this.pauseCalls += 1
    this.paused = true
  }
  addEventListener(type: string, cb: () => void): void {
    const list = this.listeners.get(type) ?? []
    list.push(cb)
    this.listeners.set(type, list)
  }
  removeEventListener(type: string, cb: () => void): void {
    const list = this.listeners.get(type) ?? []
    this.listeners.set(type, list.filter((item) => item !== cb))
  }
  emit(type: string): void {
    for (const cb of this.listeners.get(type) ?? []) cb()
  }
}

function createSource(): { source: HtmlVideoSource; element: FakeVideoElement } {
  const element = new FakeVideoElement()
  const source = new HtmlVideoSource('http://probe.local/v.webm', () => element)
  return { source, element }
}

describe('HtmlVideoSource', () => {
  it('初始状态 idle，load 后 ready 并给出媒体宽高', async () => {
    const { source, element } = createSource()
    expect(source.state).toBe('idle')
    const loading = source.load()
    expect(source.state).toBe('loading')
    element.emit('loadeddata')
    await loading
    expect(source.state).toBe('ready')
    expect(source.naturalSize).toEqual({ width: 640, height: 360 })
  })

  it('重复 load 不重建元素', async () => {
    const { source, element } = createSource()
    const first = source.load()
    const second = source.load()
    element.emit('loadeddata')
    await Promise.all([first, second])
    expect(source.element).toBe(element)
  })

  it('元素 error 事件 → load 拒绝，状态 error', async () => {
    const { source, element } = createSource()
    const loading = source.load()
    element.emit('error')
    await expect(loading).rejects.toThrow()
    expect(source.state).toBe('error')
  })

  it('play/pause/toggle 转发到元素', async () => {
    const { source, element } = createSource()
    const loading = source.load()
    element.emit('loadeddata')
    await loading

    source.play()
    expect(element.playCalls).toBe(1)
    expect(source.playing).toBe(true)
    source.toggle()
    expect(element.pauseCalls).toBe(1)
    expect(source.playing).toBe(false)
    source.toggle()
    expect(element.playCalls).toBe(2)
  })

  it('seekTo 收敛到 [0, duration]', async () => {
    const { source, element } = createSource()
    const loading = source.load()
    element.emit('loadeddata')
    await loading

    source.seekTo(5)
    expect(element.currentTime).toBe(5)
    source.seekTo(-2)
    expect(element.currentTime).toBe(0)
    source.seekTo(999)
    expect(element.currentTime).toBe(12)
  })

  it('seekToFraction 按比例换算', async () => {
    const { source, element } = createSource()
    const loading = source.load()
    element.emit('loadeddata')
    await loading

    source.seekToFraction(0.5)
    expect(element.currentTime).toBe(6)
  })

  it('setVolume 收敛到 [0,1]', async () => {
    const { source, element } = createSource()
    const loading = source.load()
    element.emit('loadeddata')
    await loading

    source.setVolume(0.3)
    expect(element.volume).toBeCloseTo(0.3)
    source.setVolume(2)
    expect(element.volume).toBe(1)
    source.setVolume(-1)
    expect(element.volume).toBe(0)
  })

  it('ended 时 playing 为 false', async () => {
    const { source, element } = createSource()
    const loading = source.load()
    element.emit('loadeddata')
    await loading

    source.play()
    element.paused = true
    element.ended = true
    expect(source.playing).toBe(false)
  })

  it('dispose 后状态回 idle，元素引用释放', async () => {
    const { source, element } = createSource()
    const loading = source.load()
    element.emit('loadeddata')
    await loading

    source.dispose()
    expect(source.state).toBe('idle')
    expect(source.element).toBeNull()
  })
})
