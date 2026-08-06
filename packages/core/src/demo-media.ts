export type DemoResolutionTier = '720p' | '1K' | '2K' | '4K' | '8K'

export interface PublicImageAsset {
  id: string
  url: string
  width: number
  height: number
  aspectRatio: string
  resolutionTier: DemoResolutionTier
}

export interface PublicVideoAsset {
  id: string
  url: string
  width: number
  height: number
  durationSeconds: number
}

export interface PublicAudioAsset {
  id: string
  url: string
  durationSeconds: number
  sampleRate: number
  channels: number
}

export const DEMO_IMAGE_REQUEST_TIERS = [0.125, 0.25, 0.5, 1, 2, 4, 8] as const
export type DemoImageRequestTier = (typeof DEMO_IMAGE_REQUEST_TIERS)[number]

// 请求档位以规模夹具的 480×300 素材格子为 1×；URL 中仍使用宽高比的整数倍。
const IMAGE_REQUEST_CELL = { width: 480, height: 300 } as const
const IMAGE_REQUEST_DOWNGRADE_RATIO = 0.8

/**
 * 按实际显示像素选择离散档位。升档不欠分辨率；降档越过 20% 迟滞带才发生，
 * 避免滚轮缩放在 1×/2× 等边界附近反复下载与解码。
 */
export function selectDemoImageRequestTier(
  canvasScale: number,
  devicePixelRatio: number,
  previousTier?: DemoImageRequestTier,
): DemoImageRequestTier {
  if (!Number.isFinite(canvasScale) || canvasScale <= 0) {
    throw new RangeError('canvasScale 必须是正有限数')
  }
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) {
    throw new RangeError('devicePixelRatio 必须是正有限数')
  }

  const requiredDensity = canvasScale * devicePixelRatio
  if (previousTier === undefined) {
    return DEMO_IMAGE_REQUEST_TIERS.find((tier) => tier >= requiredDensity) ?? 8
  }

  let index = DEMO_IMAGE_REQUEST_TIERS.indexOf(previousTier)
  if (index < 0) throw new RangeError(`未知图片请求档位：${previousTier}`)
  while (index < DEMO_IMAGE_REQUEST_TIERS.length - 1 && requiredDensity > previousTier) {
    index += 1
    previousTier = DEMO_IMAGE_REQUEST_TIERS[index]!
  }
  while (
    index > 0 &&
    requiredDensity < (DEMO_IMAGE_REQUEST_TIERS[index]! / 2) * IMAGE_REQUEST_DOWNGRADE_RATIO
  ) {
    index -= 1
  }
  return DEMO_IMAGE_REQUEST_TIERS[index]!
}

function parseAspectRatio(aspectRatio: string): readonly [number, number] {
  const [ratioWidthText, ratioHeightText] = aspectRatio.split(':')
  const ratioWidth = Number(ratioWidthText)
  const ratioHeight = Number(ratioHeightText)
  if (
    !Number.isSafeInteger(ratioWidth) || ratioWidth <= 0 ||
    !Number.isSafeInteger(ratioHeight) || ratioHeight <= 0
  ) {
    throw new Error(`图片宽高比格式无效：${aspectRatio}`)
  }

  return [ratioWidth, ratioHeight]
}

function picsumRequestUrl(seed: string, aspectRatio: string): string {
  const [ratioWidth, ratioHeight] = parseAspectRatio(aspectRatio)
  const baseScale = Math.floor(Math.min(
    IMAGE_REQUEST_CELL.width / ratioWidth,
    IMAGE_REQUEST_CELL.height / ratioHeight,
  ))
  const scale = baseScale * 2
  return `https://picsum.photos/seed/${seed}/${ratioWidth * scale}/${ratioHeight * scale}`
}

export interface DemoImageRequest {
  url: string
  width: number
  height: number
}

export interface DemoImageRequestViewportCap {
  nodeSize: { width: number; height: number }
  viewportSize: { width: number; height: number }
  devicePixelRatio: number
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} 必须是正有限数`)
}

/** 允许 0（表示「尚未测量」），但仍拒绝 NaN / Infinity / 负数。 */
function assertFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} 必须是非负有限数`)
}

function capTierToVisibleViewport(
  tier: DemoImageRequestTier,
  cap: DemoImageRequestViewportCap,
): DemoImageRequestTier {
  assertPositiveFinite(cap.nodeSize.width, 'nodeSize.width')
  assertPositiveFinite(cap.nodeSize.height, 'nodeSize.height')
  assertPositiveFinite(cap.devicePixelRatio, 'devicePixelRatio')

  // 🔴 视口尺寸为 0 是**合法的瞬时状态**，不是编程错误：
  // ResizeObserver 在容器隐藏、或首次布局完成之前会以 0×0 触发。
  // 这里原本一律 assert，结果整个画布页面直接抛 RangeError 崩掉。
  //
  // 尺寸未知时无从封顶，就不封顶 —— 保持传入档位，等测量到了下一轮自然修正。
  // 而 NaN / 负数 / Infinity 仍然抛：那些是真的算错了，不该被悄悄放过。
  //
  // 同一个教训在 `viewport-culling.ts` 的半退化视口那里也踩过：
  // 「尚未测量」必须和「值算错了」区别对待。
  assertFiniteNonNegative(cap.viewportSize.width, 'viewportSize.width')
  assertFiniteNonNegative(cap.viewportSize.height, 'viewportSize.height')
  if (cap.viewportSize.width <= 0 || cap.viewportSize.height <= 0) return tier

  const visibleDensity = Math.min(
    cap.viewportSize.width * cap.devicePixelRatio / cap.nodeSize.width,
    cap.viewportSize.height * cap.devicePixelRatio / cap.nodeSize.height,
  )
  const viewportTier = DEMO_IMAGE_REQUEST_TIERS.find(
    (candidate) => candidate >= visibleDensity,
  ) ?? 8
  return Math.min(tier, viewportTier) as DemoImageRequestTier
}

/** 根据显示档位生成请求 URL；声明的源素材元数据始终保持不变。 */
export function getDemoImageRequest(
  asset: PublicImageAsset,
  tier: DemoImageRequestTier,
  viewportCap?: DemoImageRequestViewportCap,
): DemoImageRequest {
  if (!DEMO_IMAGE_REQUEST_TIERS.includes(tier)) {
    throw new RangeError(`未知图片请求档位：${tier}`)
  }
  const parsed = new URL(asset.url)
  const segments = parsed.pathname.split('/').filter(Boolean)
  const seedIndex = segments.indexOf('seed')
  const seed = seedIndex < 0 ? undefined : segments[seedIndex + 1]
  if (parsed.hostname !== 'picsum.photos' || seed === undefined) {
    throw new Error(`不支持自适应请求的 demo 图片：${asset.id}`)
  }

  const requestTier = viewportCap === undefined ? tier : capTierToVisibleViewport(tier, viewportCap)
  const [ratioWidth, ratioHeight] = parseAspectRatio(asset.aspectRatio)
  const baseScale = Math.floor(Math.min(
    IMAGE_REQUEST_CELL.width / ratioWidth,
    IMAGE_REQUEST_CELL.height / ratioHeight,
  ))
  const sourceScale = Math.floor(Math.min(
    asset.width / ratioWidth,
    asset.height / ratioHeight,
  ))
  // 小于 1× 时向上取整宽高比倍数：宁可多一组比例单位，也不欠显示像素。
  const requestScale = Math.min(Math.ceil(baseScale * requestTier), sourceScale)
  const width = ratioWidth * requestScale
  const height = ratioHeight * requestScale
  return {
    url: `https://picsum.photos/seed/${seed}/${width}/${height}`,
    width,
    height,
  }
}

function picsumSeed(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'picsum.photos') return null
    const segments = parsed.pathname.split('/').filter(Boolean)
    const seedIndex = segments.indexOf('seed')
    return seedIndex < 0 ? null : (segments[seedIndex + 1] ?? null)
  } catch {
    return null
  }
}

/** 未命中公开 demo 清单的 URL 原样返回，绝不改写用户素材或真实 provider 结果。 */
export function resolveDemoImageRequestUrl(
  url: string,
  tier: DemoImageRequestTier,
  viewportCap?: DemoImageRequestViewportCap,
): string {
  const seed = picsumSeed(url)
  if (seed === null) return url
  const asset = PUBLIC_IMAGE_ASSETS.find((candidate) => picsumSeed(candidate.url) === seed)
  return asset === undefined ? url : getDemoImageRequest(asset, tier, viewportCap).url
}

export function isDemoImageRequestUrl(url: string): boolean {
  const seed = picsumSeed(url)
  return seed !== null && PUBLIC_IMAGE_ASSETS.some(
    (candidate) => picsumSeed(candidate.url) === seed,
  )
}

/**
 * 真实公开图片素材。
 *
 * width / height / resolutionTier 声明性能测试所模拟的源素材规格，不等于 URL
 * 实际返回的解码尺寸。列表中的 URL 是兼容旧文档的 2× 初始值；运行时按
 * 480×300 格子 × 画布缩放 × DPR 分档请求。Picsum 的固定 seed 保证换档后
 * 仍是同一张公开照片。
 */
export const PUBLIC_IMAGE_ASSETS = [
  {
    id: 'picsum-16x9-720p',
    url: picsumRequestUrl('framewright-16x9', '16:9'),
    width: 1280,
    height: 720,
    aspectRatio: '16:9',
    resolutionTier: '720p',
  },
  {
    id: 'picsum-4x3-1k',
    url: picsumRequestUrl('framewright-4x3', '4:3'),
    width: 1440,
    height: 1080,
    aspectRatio: '4:3',
    resolutionTier: '1K',
  },
  {
    id: 'picsum-1x1-2k',
    url: picsumRequestUrl('framewright-1x1', '1:1'),
    width: 2048,
    height: 2048,
    aspectRatio: '1:1',
    resolutionTier: '2K',
  },
  {
    id: 'picsum-9x16-1k',
    url: picsumRequestUrl('framewright-9x16', '9:16'),
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    resolutionTier: '1K',
  },
  {
    id: 'picsum-21x9-2k',
    url: picsumRequestUrl('framewright-21x9', '21:9'),
    width: 2560,
    height: 1080,
    aspectRatio: '21:9',
    resolutionTier: '2K',
  },
  {
    id: 'picsum-3x2-2k',
    url: picsumRequestUrl('framewright-3x2', '3:2'),
    width: 3000,
    height: 2000,
    aspectRatio: '3:2',
    resolutionTier: '2K',
  },
  {
    id: 'picsum-2x3-2k',
    url: picsumRequestUrl('framewright-2x3', '2:3'),
    width: 2000,
    height: 3000,
    aspectRatio: '2:3',
    resolutionTier: '2K',
  },
  {
    id: 'picsum-5x4-4k',
    url: picsumRequestUrl('framewright-5x4', '5:4'),
    width: 4000,
    height: 3200,
    aspectRatio: '5:4',
    resolutionTier: '4K',
  },
  {
    id: 'picsum-16x9-4k',
    url: picsumRequestUrl('framewright-4k', '16:9'),
    width: 3840,
    height: 2160,
    aspectRatio: '16:9',
    resolutionTier: '4K',
  },
  {
    id: 'picsum-20x9-8k',
    url: picsumRequestUrl('framewright-20x9', '20:9'),
    width: 10109,
    height: 4542,
    aspectRatio: '20:9',
    resolutionTier: '8K',
  },
] as const satisfies readonly PublicImageAsset[]

/**
 * 真实公开视频素材。
 *
 * 2026-08-05 实测方法：每条 URL 用 `curl -L --range 0-0` 得到 HTTP
 * 206/200 与 video/mp4，再用 ffprobe 读取容器中的真实宽高和时长。NPS
 * 「One Minute of Zen」页面明确标注 public domain；其容器时长为 60.9609 秒。
 */
export const PUBLIC_VIDEO_ASSETS = [
  {
    id: 'mdn-flower-5s',
    url: 'https://mdn.github.io/shared-assets/videos/flower.mp4',
    width: 960,
    height: 540,
    durationSeconds: 5.055,
  },
  {
    id: 'mdn-friday-6s',
    url: 'https://mdn.github.io/shared-assets/videos/friday.mp4',
    width: 640,
    height: 480,
    durationSeconds: 6.166,
  },
  {
    id: 'big-buck-bunny-10s',
    url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
    width: 640,
    height: 360,
    durationSeconds: 10,
  },
  {
    id: 'jellyfish-720p-10s',
    url: 'https://test-videos.co.uk/vids/jellyfish/mp4/h264/720/Jellyfish_720_10s_1MB.mp4',
    width: 1280,
    height: 720,
    durationSeconds: 10.01001,
  },
  {
    id: 'filesamples-13s',
    url: 'https://filesamples.com/samples/video/mp4/sample_640x360.mp4',
    width: 640,
    height: 360,
    durationSeconds: 13.346667,
  },
  {
    id: 'big-buck-bunny-trailer-33s',
    url: 'https://media.w3.org/2010/05/bunny/trailer.mp4',
    width: 853,
    height: 480,
    durationSeconds: 33.002667,
  },
  {
    id: 'sintel-trailer-52s',
    url: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
    width: 854,
    height: 480,
    durationSeconds: 52.208333,
  },
  {
    id: 'nps-one-minute-of-zen',
    url: 'https://www.nps.gov/nps-audiovideo/audiovideo/bed5ac9d-bdcd-4fc0-81c1-4f9e9b88a783720p.mp4',
    width: 1280,
    height: 720,
    durationSeconds: 60.9609,
  },
  // 2026-08-05 追加（curl 206、ffprobe 远程实测），把视频分辨率铺开到 1080p 档：
  {
    id: 'jellyfish-1080p-10s',
    url: 'https://test-videos.co.uk/vids/jellyfish/mp4/h264/1080/Jellyfish_1080_10s_1MB.mp4',
    width: 1920,
    height: 1080,
    durationSeconds: 10.01001,
  },
] as const satisfies readonly PublicVideoAsset[]

/**
 * 真实公开音频素材。
 *
 * 2026-08-05 实测方法：每条 URL 用 `curl -L --range 0-0` 得到 HTTP
 * 206/200 与 audio/mp3 或 audio/mpeg，再用 ffprobe 读取真实时长、采样率和声道数。
 * 两个曾被推荐的旧 MDN 路径实测为 HTTP 404，未收录。
 */
export const PUBLIC_AUDIO_ASSETS = [
  {
    id: 'mdn-t-rex-roar-2s',
    url: 'https://mdn.github.io/shared-assets/audio/t-rex-roar.mp3',
    durationSeconds: 2.074218,
    sampleRate: 44_100,
    channels: 2,
  },
  {
    id: 'samplelib-audio-3s',
    url: 'https://samplelib.com/lib/preview/mp3/sample-3s.mp3',
    durationSeconds: 3.195646,
    sampleRate: 44_100,
    channels: 2,
  },
  {
    id: 'samplelib-audio-19s',
    url: 'https://samplelib.com/lib/preview/mp3/sample-15s.mp3',
    durationSeconds: 19.173878,
    sampleRate: 44_100,
    channels: 2,
  },
  {
    id: 'mdn-viper-41s',
    url: 'https://mdn.github.io/webaudio-examples/audio-analyser/viper.mp3',
    durationSeconds: 40.933875,
    sampleRate: 44_100,
    channels: 2,
  },
  {
    id: 'mdn-outfoxing-97s',
    url: 'https://mdn.github.io/webaudio-examples/audio-basics/outfoxing.mp3',
    durationSeconds: 97.404422,
    sampleRate: 44_100,
    channels: 2,
  },
  {
    id: 'soundhelix-song-1-373s',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    durationSeconds: 372.715083,
    sampleRate: 44_100,
    channels: 2,
  },
] as const satisfies readonly PublicAudioAsset[]

/** 兼容现有 demo 文档的单素材入口；值已由内联 data URL 改为真实公开 URL。 */
export const DEMO_IMAGE_DATA_URL = PUBLIC_IMAGE_ASSETS[0].url

/** 兼容现有 demo 文档的单素材入口；值已由内联 data URL 改为真实公开 URL。 */
export const DEMO_VIDEO_DATA_URL = PUBLIC_VIDEO_ASSETS[0].url
