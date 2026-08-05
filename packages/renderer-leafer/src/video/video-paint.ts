import { Creator, PaintImage, LeaferVideo, type ILeafPaint, type ILeaferImageConfig, type IUI } from 'leafer-ui'
import { formatPlaybackTime } from './player-controls'
import { HtmlVideoSource, type VideoElementFactory } from './video-source'

/**
 * Leafer 集成层（C3-leafer）。
 *
 * 背景（实测结论，2026-08-05）：leafer-ui@2.2.9 的类型里声明了完整的
 * IVideoDecoder / LeaferVideo / Creator.video / PaintImage.video，但**实现全部缺席**——
 * Creator.video 从未注册，Resource.loadVideo() 是返回 undefined 的空壳，
 * PaintImage.video 钩子不存在（type:'video' 的 paint 会无条件调用它，直接 TypeError）。
 * 真正实现是付费插件 @leafer-in/video（不上公开 npm，需购买授权）。
 * 本仓 AGENTS.md §2/§5 不允许引入付费授权依赖，故以下三件全部自实现：
 *
 * ① Creator.video 工厂——HtmlVideoImage（包装原生 HTMLVideoElement）
 * ② PaintImage.video 空钩子——防 TypeError；逐帧直绘由 fill spec 的 changeful:true 驱动
 *    （checkImage 读到 originPaint.changeful 就跳过 pattern 缓存，每次重绘直接 image.render()）
 * ③ 帧驱动——播放中逐帧 forceUpdate + 控件跟随（rAF，与 generation-unit 扫光同模式）
 */

// ---------------------------------------------------------------------------
// 播放源注册表：一个 URL 一个 HtmlVideoSource。
// 渲染器每次 draw() 都重建场景图，播放状态必须活在场景图之外，这里是它的家。
// 已知取舍：同 URL 的两个视频节点共享播放状态（进度/暂停联动）。
// ---------------------------------------------------------------------------

const sources = new Map<string, HtmlVideoSource>()

const defaultElementFactory: VideoElementFactory = (url) => {
  const el = document.createElement('video')
  el.preload = 'auto'
  el.playsInline = true
  el.src = url
  return el
}

let elementFactory: VideoElementFactory = defaultElementFactory

export function getOrCreateVideoSource(url: string): HtmlVideoSource {
  let source = sources.get(url)
  if (source === undefined) {
    source = new HtmlVideoSource(url, elementFactory)
    sources.set(url, source)
  }
  return source
}

/** 测试专用：注入假元素工厂。 */
export function setVideoElementFactoryForTest(factory: VideoElementFactory): void {
  elementFactory = factory
}

/** 测试专用：释放全部播放源、清空帧驱动绑定并还原元素工厂。 */
export function releaseVideoRegistryForTest(): void {
  for (const source of sources.values()) source.dispose()
  sources.clear()
  bindings.clear()
  elementFactory = defaultElementFactory
}

// ---------------------------------------------------------------------------
// ① Creator.video：把 HtmlVideoSource 接进 Leafer 的 paint 管线
// ---------------------------------------------------------------------------

export class HtmlVideoImage extends LeaferVideo {
  readonly source: HtmlVideoSource

  constructor(config: ILeaferImageConfig) {
    super(config)
    this.source = getOrCreateVideoSource(config.url ?? '')
  }

  /** 不走 Platform.origin.loadVideo（开源版没有），走自己的播放源。 */
  override load(onSuccess?: (image: HtmlVideoImage) => void, onError?: (error: unknown) => void): number {
    if (this.ready) {
      onSuccess?.(this)
      return -1
    }
    this.loading = true
    const loadId = this.waitComplete.push(
      onSuccess as never,
      onError as never,
    ) - 2
    this.source.load().then(
      () => {
        const el = this.source.element
        if (el !== null) {
          this.width = el.videoWidth
          this.height = el.videoHeight
          // view 直接是 HTMLVideoElement：继承的 render() 调 canvas.drawImage(view)，
          // 浏览器原生支持把 video 元素画进 2d canvas（取当前帧）
          this.view = el as never
        }
        this.ready = true
        this.loading = false
        this.onComplete(true)
      },
      (error: unknown) => {
        this.error = error as never
        this.loading = false
        this.onComplete(false)
      },
    )
    return loadId
  }

  override destroy(): void {
    super.destroy()
    this.source.dispose()
    sources.delete(this.source.url)
  }
}

let registered = false

export function ensureVideoPaintRegistered(): void {
  if (registered) return
  registered = true
  Object.assign(Creator, {
    video: (config?: ILeaferImageConfig) => new HtmlVideoImage(config ?? { url: '' }),
  })
  // 开源版 PaintImage 没有 video 钩子，type:'video' 的 paint 会无条件调它。
  // 我们的逐帧直绘靠 fill spec 显式给 changeful:true，钩子本身无需做事。
  if (typeof PaintImage.video !== 'function') {
    PaintImage.video = (_paint: ILeafPaint) => {}
  }
}

// ---------------------------------------------------------------------------
// ③ 帧驱动：播放中逐帧 forceUpdate 画面，控件（进度/时间/音量/图标）跟随。
// 自清洁：画面离开场景图（draw() 重建）后自动移出绑定，与 generation-unit 扫光同模式。
// ---------------------------------------------------------------------------

export interface VideoBinding {
  /** 视频画面（fill 为 video paint 的 Rect），forceUpdate 的对象 */
  screen: IUI
  source: HtmlVideoSource
  progressFill?: IUI
  progressTrackWidth?: number
  /** 时间文本（Text 元素），驱动写其 text */
  timeText?: { text?: string | number | undefined }
  volumeFill?: IUI
  volumeTrackWidth?: number
  playIcon?: IUI
  pauseIcon?: IUI
}

interface BindingState extends VideoBinding {
  attached: boolean
  lastTime: number
}

const bindings = new Set<BindingState>()

export function tickVideoBindings(): void {
  for (const binding of bindings) {
    if (binding.screen.leafer != null) {
      binding.attached = true
    } else if (binding.attached) {
      bindings.delete(binding)
      continue
    }
    const { source } = binding
    const time = source.currentTime
    const duration = source.duration
    const playing = source.playing

    if (binding.progressFill !== undefined && binding.progressTrackWidth !== undefined) {
      binding.progressFill.width = duration > 0 ? binding.progressTrackWidth * (time / duration) : 0
    }
    if (binding.timeText !== undefined) {
      binding.timeText.text = `${formatPlaybackTime(time)} / ${formatPlaybackTime(duration)}`
    }
    if (binding.volumeFill !== undefined && binding.volumeTrackWidth !== undefined) {
      binding.volumeFill.width = binding.volumeTrackWidth * (source.element?.volume ?? 0)
    }
    if (binding.playIcon !== undefined) binding.playIcon.visible = !playing
    if (binding.pauseIcon !== undefined) binding.pauseIcon.visible = playing

    // 播放中每帧重绘；暂停时进度变了（seek / 首帧到达）也要补一帧
    if (source.state === 'ready' && (playing || time !== binding.lastTime)) {
      binding.screen.forceUpdate('surface')
    }
    binding.lastTime = time
  }
}

const raf: ((cb: () => void) => number) | undefined =
  typeof globalThis.requestAnimationFrame === 'function'
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : undefined

let rafId: number | null = null

function loop(): void {
  rafId = null
  tickVideoBindings()
  if (bindings.size > 0 && raf !== undefined) rafId = raf(loop)
}

export function attachVideoBinding(binding: VideoBinding): void {
  bindings.add({ ...binding, attached: binding.screen.leafer != null, lastTime: -1 })
  if (rafId === null && raf !== undefined) rafId = raf(loop)
}
