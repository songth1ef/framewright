import { isVideoNode } from '@framewright/core'
import { Box, PointerEvent, Polygon, Rect, Text, type IPointerEvent, type IUI } from 'leafer-ui'
import { toLeaferProps } from '../node-props'
import type { ShapeFactory } from '../shapes/registry'
import {
  VIDEO_CONTROLS_STYLE,
  hitTestVideoControls,
  layoutVideoControls,
  type VideoControlHit,
} from './player-controls'
import { attachVideoBinding, ensureVideoPaintRegistered, getOrCreateVideoSource } from './video-paint'

/**
 * video shape（C3-leafer）：可播放的视频节点。
 * 一个 Box 容器 = 视频画面（changeful video paint）+ 自绘控制条。
 *
 * 控制条全部自绘 + 自做命中（Leafer 侧没有浏览器原生控件，这是本项的主要成本）：
 * 播放钮（三角形/双杠图标切换）、进度轨、时间文本、音量轨。
 * 交互集中在控制条上（fwVideoControl 标记 → 命中探针排除画布手势）；
 * 装饰性部件 hittable:false，让命中穿透到控制条统一处理。
 *
 * 已知取舍（如实记录）：
 * - 进度/音量只支持点按（tap），不支持按住拖动——拖动 seek 预估再加 30~40 行
 * - 画面区域点按不切换播放（留给节点选中/拖拽），播放只能从控制条控制
 * - 同 URL 节点共享播放状态（见 video-paint.ts 注册表注释）
 */

const S = VIDEO_CONTROLS_STYLE

/** 装饰性部件：穿透命中，让控制条收到事件。 */
function decorative<T extends IUI>(ui: T): T {
  ui.hittable = false
  return ui
}

function buildPlayIcons(container: IUI, layout: ReturnType<typeof layoutVideoControls>): { playIcon: IUI; pauseIcon: IUI } {
  const { playButton } = layout
  // 播放：三角形（Polygon sides:3 默认朝上，转 90° 朝右）
  const playIcon = decorative(
    new Polygon({
      sides: 3,
      x: playButton.x + 7,
      y: playButton.y + 4,
      width: 12,
      height: 16,
      rotation: 90,
      fill: S.accentColor,
    }),
  )
  // 暂停：双杠
  const barWidth = 4
  const barHeight = 14
  const pauseY = playButton.y + (playButton.height - barHeight) / 2
  const pauseIcon = decorative(
    new Box({ x: playButton.x + 6, y: pauseY, width: 12, height: barHeight, children: [
      new Rect({ x: 0, y: 0, width: barWidth, height: barHeight, fill: S.accentColor }),
      new Rect({ x: 8, y: 0, width: barWidth, height: barHeight, fill: S.accentColor }),
    ] }),
  )
  container.add(playIcon)
  container.add(pauseIcon)
  return { playIcon, pauseIcon }
}

export function createVideoShape(): ShapeFactory {
  return ({ node, position, size }) => {
    if (!isVideoNode(node)) {
      throw new Error(`createVideoShape 只接受 video，收到 ${node.fwType}`)
    }
    ensureVideoPaintRegistered()
    const width = size?.width ?? node.width
    const height = size?.height ?? node.height

    const container = new Box({
      ...toLeaferProps(node, position, size),
      fill: '#000000',
      overflow: 'hide',
    })

    const mode = node.fit === 'cover' ? 'cover' : node.fit === 'fill' ? 'stretch' : 'fit'
    // changeful:true = 内容每帧变化 → paint 管线跳过 pattern 缓存，每次重绘直接取视频当前帧
    const screen = new Rect({
      x: 0,
      y: 0,
      width,
      height,
      fill: { type: 'video', url: node.src, mode, changeful: true },
    })
    container.add(screen)

    const source = getOrCreateVideoSource(node.src)
    // 提前开始加载：控件的时间显示要 duration；画面首帧也要它。拒绝由 paint 管线兜底。
    void source.load().catch(() => {})

    // --- 自绘控制条 ---
    const layout = layoutVideoControls(width, height)
    const bar = new Rect({ ...layout.bar, fill: S.barBackground })
    bar.data = { fwVideoControl: true }
    bar.cursor = 'pointer'
    container.add(bar)

    const { playIcon, pauseIcon } = buildPlayIcons(container, layout)

    const progressTrack = decorative(new Rect({ ...layout.progressTrack, fill: S.trackColor }))
    const progressFill = decorative(
      new Rect({ ...layout.progressTrack, width: 0, fill: S.accentColor }),
    )
    container.add(progressTrack)
    container.add(progressFill)

    const timeText = decorative(
      new Text({
        ...layout.timeText,
        text: '0:00 / 0:00',
        fontSize: S.timeFontSize,
        fill: S.accentColor,
        textAlign: 'center',
        verticalAlign: 'middle',
      }),
    )
    container.add(timeText)

    const volumeTrack = decorative(new Rect({ ...layout.volumeTrack, fill: S.trackColor }))
    const volumeFill = decorative(
      new Rect({ ...layout.volumeTrack, width: 0, fill: S.accentColor }),
    )
    container.add(volumeTrack)
    container.add(volumeFill)

    bar.on(PointerEvent.TAP, (event: IPointerEvent) => {
      const local = event.getInnerPoint?.(container) ?? { x: event.x, y: event.y }
      const hit: VideoControlHit | null = hitTestVideoControls(layout, local)
      if (hit === null) return
      switch (hit.type) {
        case 'toggle-play':
          source.toggle()
          break
        case 'seek':
          source.seekToFraction(hit.fraction)
          break
        case 'volume':
          source.setVolume(hit.value)
          break
        case 'bar':
          break // 条内空白：吞掉，不透传
      }
    })

    attachVideoBinding({
      screen,
      source,
      progressFill,
      progressTrackWidth: layout.progressTrack.width,
      timeText,
      volumeFill,
      volumeTrackWidth: layout.volumeTrack.width,
      playIcon,
      pauseIcon,
    })

    return container
  }
}
