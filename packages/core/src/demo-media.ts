export type DemoResolutionTier = '720p' | '1K' | '2K' | '4K'

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

/**
 * 真实公开图片素材。
 *
 * 2026-08-05 实测方法：每条 URL 先用
 * `curl -L --range 0-0` 验证最终响应为 HTTP 206 image/jpeg，再用
 * `ffprobe -show_entries stream=width,height` 核对下列真实像素尺寸。
 * Picsum 的固定 seed 让同一 URL 始终返回同一张公开照片。
 * 8K 候选 7680×4320 实测返回 HTTP 400，因此没有伪装成可用素材收录。
 */
export const PUBLIC_IMAGE_ASSETS = [
  {
    id: 'picsum-16x9-720p',
    url: 'https://picsum.photos/seed/framewright-16x9/1280/720',
    width: 1280,
    height: 720,
    aspectRatio: '16:9',
    resolutionTier: '720p',
  },
  {
    id: 'picsum-4x3-1k',
    url: 'https://picsum.photos/seed/framewright-4x3/1440/1080',
    width: 1440,
    height: 1080,
    aspectRatio: '4:3',
    resolutionTier: '1K',
  },
  {
    id: 'picsum-1x1-2k',
    url: 'https://picsum.photos/seed/framewright-1x1/2048/2048',
    width: 2048,
    height: 2048,
    aspectRatio: '1:1',
    resolutionTier: '2K',
  },
  {
    id: 'picsum-9x16-1k',
    url: 'https://picsum.photos/seed/framewright-9x16/1080/1920',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    resolutionTier: '1K',
  },
  {
    id: 'picsum-21x9-2k',
    url: 'https://picsum.photos/seed/framewright-21x9/2560/1080',
    width: 2560,
    height: 1080,
    aspectRatio: '21:9',
    resolutionTier: '2K',
  },
  {
    id: 'picsum-3x2-2k',
    url: 'https://picsum.photos/seed/framewright-3x2/3000/2000',
    width: 3000,
    height: 2000,
    aspectRatio: '3:2',
    resolutionTier: '2K',
  },
  {
    id: 'picsum-2x3-2k',
    url: 'https://picsum.photos/seed/framewright-2x3/2000/3000',
    width: 2000,
    height: 3000,
    aspectRatio: '2:3',
    resolutionTier: '2K',
  },
  {
    id: 'picsum-5x4-4k',
    url: 'https://picsum.photos/seed/framewright-5x4/4000/3200',
    width: 4000,
    height: 3200,
    aspectRatio: '5:4',
    resolutionTier: '4K',
  },
  {
    id: 'picsum-16x9-4k',
    url: 'https://picsum.photos/seed/framewright-4k/3840/2160',
    width: 3840,
    height: 2160,
    aspectRatio: '16:9',
    resolutionTier: '4K',
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
] as const satisfies readonly PublicVideoAsset[]

/** 兼容现有 demo 文档的单素材入口；值已由内联 data URL 改为真实公开 URL。 */
export const DEMO_IMAGE_DATA_URL = PUBLIC_IMAGE_ASSETS[0].url

/** 兼容现有 demo 文档的单素材入口；值已由内联 data URL 改为真实公开 URL。 */
export const DEMO_VIDEO_DATA_URL = PUBLIC_VIDEO_ASSETS[0].url
