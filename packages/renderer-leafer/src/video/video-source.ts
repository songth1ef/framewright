/**
 * 播放源状态机（C3-leafer）：一个 URL 一个 HtmlVideoSource，包装 HTMLVideoElement。
 *
 * 为什么需要它而不是直接用 Leafer 的 IVideoDecoder：
 * leafer-ui@2.2.9 的类型里确实有 IVideoDecoder，但**实现不在开源包里**——
 * 它是付费插件 @leafer-in/video（不上公开 npm，需购买授权）。本仓 AGENTS.md §2
 * 要求可开源、不引入付费授权依赖，所以用原生 HTMLVideoElement 自实现同一抽象。
 *
 * 与 DOM 解耦：元素由工厂注入，单测用假元素驱动；真实行为由浏览器 probe 验证。
 * 元素创建是惰性的（首次 load），避免节点仅被渲染时就抢占解码资源。
 */

/** HTMLVideoElement 的最小可用面（我们的代码只依赖这些）。 */
export interface VideoElementLike {
  src: string
  loop: boolean
  volume: number
  currentTime: number
  readonly duration: number
  readonly paused: boolean
  readonly ended: boolean
  readonly videoWidth: number
  readonly videoHeight: number
  play(): Promise<void> | void
  pause(): void
  addEventListener(type: string, cb: () => void): void
  removeEventListener(type: string, cb: () => void): void
}

export type VideoSourceState = 'idle' | 'loading' | 'ready' | 'error'

export type VideoElementFactory = (url: string) => VideoElementLike

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

export class HtmlVideoSource {
  readonly url: string
  private readonly createElement: VideoElementFactory
  private el: VideoElementLike | null = null
  private loadPromise: Promise<void> | null = null
  private _state: VideoSourceState = 'idle'
  private onLoadedData: (() => void) | null = null
  private onError: (() => void) | null = null

  constructor(url: string, createElement: VideoElementFactory) {
    this.url = url
    this.createElement = createElement
  }

  get state(): VideoSourceState {
    return this._state
  }

  get element(): VideoElementLike | null {
    return this.el
  }

  get naturalSize(): { width: number; height: number } | null {
    if (this.el === null || this._state !== 'ready') return null
    return { width: this.el.videoWidth, height: this.el.videoHeight }
  }

  get playing(): boolean {
    return this.el !== null && !this.el.paused && !this.el.ended
  }

  get currentTime(): number {
    return this.el?.currentTime ?? 0
  }

  get duration(): number {
    const duration = this.el?.duration ?? 0
    return Number.isFinite(duration) ? duration : 0
  }

  load(): Promise<void> {
    if (this._state === 'ready') return Promise.resolve()
    if (this.loadPromise !== null) return this.loadPromise
    this._state = 'loading'
    const el = this.createElement(this.url)
    this.el = el
    el.src = this.url
    this.loadPromise = new Promise<void>((resolve, reject) => {
      this.onLoadedData = () => {
        this._state = 'ready'
        resolve()
      }
      this.onError = () => {
        this._state = 'error'
        reject(new Error(`视频加载失败: ${this.url}`))
      }
      el.addEventListener('loadeddata', this.onLoadedData)
      el.addEventListener('error', this.onError)
    })
    return this.loadPromise
  }

  play(): void {
    void this.el?.play()
  }

  pause(): void {
    this.el?.pause()
  }

  toggle(): void {
    if (this.playing) this.pause()
    else this.play()
  }

  seekTo(seconds: number): void {
    if (this.el === null) return
    this.el.currentTime = clamp(seconds, 0, this.duration)
  }

  seekToFraction(fraction: number): void {
    this.seekTo(clamp(fraction, 0, 1) * this.duration)
  }

  setVolume(value: number): void {
    if (this.el === null) return
    this.el.volume = clamp(value, 0, 1)
  }

  dispose(): void {
    const el = this.el
    if (el !== null) {
      if (this.onLoadedData !== null) el.removeEventListener('loadeddata', this.onLoadedData)
      if (this.onError !== null) el.removeEventListener('error', this.onError)
      el.pause()
      // 释放解码资源：清空 src 让浏览器回收（真实浏览器语义；假元素无感）
      el.src = ''
    }
    this.el = null
    this.loadPromise = null
    this.onLoadedData = null
    this.onError = null
    this._state = 'idle'
  }
}
