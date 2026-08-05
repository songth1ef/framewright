import { describe, expect, it } from 'vitest'
import {
  VIDEO_CONTROLS_STYLE,
  formatPlaybackTime,
  hitTestVideoControls,
  layoutVideoControls,
} from './player-controls'

// 视频播放控件的几何与命中（C3-leafer）。纯函数，不依赖 Leafer。
// 坐标系：相对视频 node 容器左上角，与 generation-unit 内部布局同口径。

describe('layoutVideoControls', () => {
  it('控制条贴容器底边，高度为常量', () => {
    const layout = layoutVideoControls(320, 240)
    expect(layout.bar).toEqual({ x: 0, y: 240 - VIDEO_CONTROLS_STYLE.barHeight, width: 320, height: VIDEO_CONTROLS_STYLE.barHeight })
  })

  it('控件水平排列无重叠且都在条内：播放钮 < 进度轨 < 时间 < 音量', () => {
    const layout = layoutVideoControls(320, 240)
    const barBottom = layout.bar.y + layout.bar.height
    const ordered = [layout.playButton, layout.progressTrack, layout.timeText, layout.volumeTrack]
    for (const rect of ordered) {
      expect(rect.y).toBeGreaterThanOrEqual(layout.bar.y)
      expect(rect.y + rect.height).toBeLessThanOrEqual(barBottom)
    }
    for (let i = 0; i < ordered.length - 1; i++) {
      const current = ordered[i]!
      const next = ordered[i + 1]!
      expect(current.x + current.width).toBeLessThanOrEqual(next.x)
    }
    expect(layout.volumeTrack.x + layout.volumeTrack.width).toBeLessThanOrEqual(320)
  })

  it('容器变窄时进度轨收缩但不出现负宽度', () => {
    const layout = layoutVideoControls(160, 120)
    expect(layout.progressTrack.width).toBeGreaterThanOrEqual(0)
    expect(layout.volumeTrack.x + layout.volumeTrack.width).toBeLessThanOrEqual(160)
  })
})

describe('hitTestVideoControls', () => {
  const layout = layoutVideoControls(320, 240)

  it('命中播放钮 → toggle-play', () => {
    const x = layout.playButton.x + layout.playButton.width / 2
    const y = layout.playButton.y + layout.playButton.height / 2
    expect(hitTestVideoControls(layout, { x, y })).toEqual({ type: 'toggle-play' })
  })

  it('命中进度轨 → seek，fraction 为轨内相对位置', () => {
    const track = layout.progressTrack
    const hit = hitTestVideoControls(layout, { x: track.x + track.width / 2, y: track.y + track.height / 2 })
    expect(hit).toEqual({ type: 'seek', fraction: 0.5 })
  })

  it('seek fraction 越界收敛到 [0,1]', () => {
    const track = layout.progressTrack
    // 用命中区域内的点，但构造 x 恰好落在边缘外的极端情况由 clamp 兜底：
    // 这里直接验证两端
    expect(hitTestVideoControls(layout, { x: track.x, y: track.y + 1 })).toEqual({ type: 'seek', fraction: 0 })
    expect(hitTestVideoControls(layout, { x: track.x + track.width, y: track.y + 1 })).toEqual({ type: 'seek', fraction: 1 })
  })

  it('命中音量轨 → volume，value 为轨内相对位置', () => {
    const track = layout.volumeTrack
    const hit = hitTestVideoControls(layout, { x: track.x + track.width * 0.25, y: track.y + track.height / 2 })
    expect(hit).toEqual({ type: 'volume', value: 0.25 })
  })

  it('命中条内空白 → bar（吞掉事件，不触发任何动作）', () => {
    // 播放钮与进度轨之间有 GAP 间隙
    const gapX = layout.playButton.x + layout.playButton.width + 1
    const y = layout.bar.y + layout.bar.height / 2
    expect(gapX).toBeLessThan(layout.progressTrack.x)
    expect(hitTestVideoControls(layout, { x: gapX, y })).toEqual({ type: 'bar' })
  })

  it('命中控制条之外 → null', () => {
    expect(hitTestVideoControls(layout, { x: 100, y: layout.bar.y - 1 })).toBeNull()
  })
})

describe('formatPlaybackTime', () => {
  it('常规秒数 → m:ss（秒补零）', () => {
    expect(formatPlaybackTime(0)).toBe('0:00')
    expect(formatPlaybackTime(5)).toBe('0:05')
    expect(formatPlaybackTime(61)).toBe('1:01')
    expect(formatPlaybackTime(599)).toBe('9:59')
  })

  it('不足一秒的小数向下取整', () => {
    expect(formatPlaybackTime(5.9)).toBe('0:05')
  })

  it('异常输入（NaN / Infinity / 负数）归零', () => {
    expect(formatPlaybackTime(Number.NaN)).toBe('0:00')
    expect(formatPlaybackTime(Number.POSITIVE_INFINITY)).toBe('0:00')
    expect(formatPlaybackTime(-3)).toBe('0:00')
  })
})
