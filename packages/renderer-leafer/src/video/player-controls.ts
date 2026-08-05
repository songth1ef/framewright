import type { Point, Rect as CoreRect } from '@framewright/core'

/**
 * 视频播放控件的几何与命中（C3-leafer）。纯函数，不依赖 Leafer。
 * Leafer 侧没有浏览器原生控件，进度条 / 播放钮 / 时间 / 音量全部自绘，
 * 本模块回答两个问题：「画在哪」（layout）与「点到了什么」（hitTest）。
 * 坐标系：相对视频 node 容器左上角，与 generation-unit 内部布局同口径。
 */

export const VIDEO_CONTROLS_STYLE = {
  barHeight: 36,
  paddingX: 8,
  gap: 8,
  playSize: 24,
  trackHeight: 4,
  timeWidth: 78,
  timeFontSize: 12,
  volumeWidth: 56,
  barBackground: 'rgba(0,0,0,0.55)',
  accentColor: '#FFFFFF',
  trackColor: 'rgba(255,255,255,0.35)',
} as const

export interface VideoControlsLayout {
  bar: CoreRect
  playButton: CoreRect
  progressTrack: CoreRect
  timeText: CoreRect
  volumeTrack: CoreRect
}

export type VideoControlHit =
  | { type: 'toggle-play' }
  | { type: 'seek'; fraction: number }
  | { type: 'volume'; value: number }
  /** 条内空白：吞掉事件（不透传给画布手势），但不触发动作 */
  | { type: 'bar' }

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

export function layoutVideoControls(width: number, height: number): VideoControlsLayout {
  const S = VIDEO_CONTROLS_STYLE
  const bar: CoreRect = { x: 0, y: height - S.barHeight, width, height: S.barHeight }
  const centerY = (itemHeight: number): number => bar.y + (S.barHeight - itemHeight) / 2

  const playButton: CoreRect = {
    x: S.paddingX,
    y: centerY(S.playSize),
    width: S.playSize,
    height: S.playSize,
  }
  const volumeTrack: CoreRect = {
    x: width - S.paddingX - S.volumeWidth,
    y: centerY(S.trackHeight),
    width: S.volumeWidth,
    height: S.trackHeight,
  }
  const timeText: CoreRect = {
    x: volumeTrack.x - S.gap - S.timeWidth,
    y: bar.y,
    width: S.timeWidth,
    height: S.barHeight,
  }
  const progressX = playButton.x + playButton.width + S.gap
  const progressTrack: CoreRect = {
    x: progressX,
    y: centerY(S.trackHeight),
    width: Math.max(0, timeText.x - S.gap - progressX),
    height: S.trackHeight,
  }
  return { bar, playButton, progressTrack, timeText, volumeTrack }
}

const contains = (rect: CoreRect, point: Point): boolean =>
  point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height

export function hitTestVideoControls(layout: VideoControlsLayout, point: Point): VideoControlHit | null {
  if (!contains(layout.bar, point)) return null
  if (contains(layout.playButton, point)) return { type: 'toggle-play' }
  if (contains(layout.progressTrack, point)) {
    const { x, width } = layout.progressTrack
    return { type: 'seek', fraction: width <= 0 ? 0 : clamp01((point.x - x) / width) }
  }
  if (contains(layout.volumeTrack, point)) {
    const { x, width } = layout.volumeTrack
    return { type: 'volume', value: width <= 0 ? 0 : clamp01((point.x - x) / width) }
  }
  return { type: 'bar' }
}

/** 秒 → `m:ss`。异常输入（NaN / Infinity / 负数）归零，绝不显示 NaN。 */
export function formatPlaybackTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}
