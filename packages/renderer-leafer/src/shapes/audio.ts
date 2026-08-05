import { isAudioNode } from '@framewright/core'
import { Box, PointerEvent, Polygon, Rect, Text, type IPointerEvent, type IUI } from 'leafer-ui'
import { toLeaferProps } from '../node-props'
import {
  VIDEO_CONTROLS_STYLE,
  hitTestVideoControls,
  layoutVideoControls,
  type VideoControlHit,
} from '../video/player-controls'
import { attachVideoBinding, getOrCreateVideoSource } from '../video/video-paint'
import type { ShapeFactory } from './registry'

const S = VIDEO_CONTROLS_STYLE

function decorative<T extends IUI>(ui: T): T {
  ui.hittable = false
  return ui
}

function addPlaybackControls(container: IUI, width: number, height: number, src: string): void {
  const layout = layoutVideoControls(width, height)
  const bar = new Rect({ ...layout.bar, fill: S.barBackground })
  bar.data = { fwVideoControl: true }
  bar.cursor = 'pointer'
  container.add(bar)

  const playIcon = decorative(new Polygon({
    sides: 3,
    x: layout.playButton.x + 7,
    y: layout.playButton.y + 4,
    width: 12,
    height: 16,
    rotation: 90,
    fill: S.accentColor,
  }))
  const pauseIcon = decorative(new Box({
    x: layout.playButton.x + 6,
    y: layout.playButton.y + 5,
    width: 12,
    height: 14,
    children: [
      new Rect({ x: 0, y: 0, width: 4, height: 14, fill: S.accentColor }),
      new Rect({ x: 8, y: 0, width: 4, height: 14, fill: S.accentColor }),
    ],
  }))
  container.add(playIcon)
  container.add(pauseIcon)

  const progressTrack = decorative(new Rect({ ...layout.progressTrack, fill: S.trackColor }))
  const progressFill = decorative(new Rect({ ...layout.progressTrack, width: 0, fill: S.accentColor }))
  const timeText = decorative(new Text({
    ...layout.timeText,
    text: '0:00 / 0:00',
    fontSize: S.timeFontSize,
    fill: S.accentColor,
    textAlign: 'center',
    verticalAlign: 'middle',
  }))
  const volumeTrack = decorative(new Rect({ ...layout.volumeTrack, fill: S.trackColor }))
  const volumeFill = decorative(new Rect({ ...layout.volumeTrack, width: 0, fill: S.accentColor }))
  container.add(progressTrack)
  container.add(progressFill)
  container.add(timeText)
  container.add(volumeTrack)
  container.add(volumeFill)

  const source = getOrCreateVideoSource(src)
  void source.load().catch(() => {})
  bar.on(PointerEvent.TAP, (event: IPointerEvent) => {
    // 与 video-node 同口径：event.x/y 是 world 坐标，缺 getInnerPoint 时也做
    // 同一个世界→容器换算，绝不把 world 坐标直接喂容器坐标系的 hitTest。
    const local = event.getInnerPoint
      ? event.getInnerPoint(container)
      : container.getInnerPoint({ x: event.x, y: event.y })
    const hit: VideoControlHit | null = hitTestVideoControls(layout, local)
    if (hit === null) return
    switch (hit.type) {
      case 'toggle-play': source.toggle(); break
      case 'seek': source.seekToFraction(hit.fraction); break
      case 'volume': source.setVolume(hit.value); break
      case 'bar': break
    }
  })

  attachVideoBinding({
    // 绑定在会被 replaceChildren 搬到旧容器的子节点上，
    // 避免更新时把帧驱动绑到随即销毁的临时容器。
    screen: progressFill,
    source,
    progressFill,
    progressTrackWidth: layout.progressTrack.width,
    timeText,
    volumeFill,
    volumeTrackWidth: layout.volumeTrack.width,
    playIcon,
    pauseIcon,
  })
}

export function createAudioShape(): ShapeFactory {
  return ({ node, position, size }) => {
    if (!isAudioNode(node)) {
      throw new Error(`createAudioShape 只接受 audio，收到 ${node.fwType}`)
    }
    const width = size?.width ?? node.width
    const height = size?.height ?? node.height
    const container = new Box({
      ...toLeaferProps(node, position, size),
      fill: node.src === '' ? '#DDDDDD' : '#171A21',
      stroke: node.src === '' ? '#999999' : undefined,
      strokeWidth: node.src === '' ? 1 : 0,
      dashPattern: node.src === '' ? [4, 4] : undefined,
      cornerRadius: node.src === '' ? 0 : 8,
      overflow: 'hide',
    })
    if (node.src === '') return container

    const contentHeight = Math.max(0, height - S.barHeight)
    container.add(decorative(new Text({
      x: 14,
      y: 10,
      width: 28,
      height: Math.min(30, contentHeight),
      text: '♫',
      fontSize: 24,
      fill: '#8DB6FF',
      verticalAlign: 'middle',
    })))
    container.add(decorative(new Text({
      x: 48,
      y: 10,
      width: Math.max(0, width - 62),
      height: Math.min(30, contentHeight),
      text: node.name || '音频',
      fontSize: 14,
      fill: '#FFFFFF',
      textOverflow: 'ellipsis',
      verticalAlign: 'middle',
    })))
    container.add(decorative(new Text({
      x: 14,
      y: Math.max(38, contentHeight - 24),
      width: Math.max(0, width - 28),
      height: 18,
      text: '▁▃▆▂▅▇▃▂▆▄▁',
      fontSize: 16,
      fill: '#526889',
      textOverflow: 'clip',
    })))
    addPlaybackControls(container, width, height, node.src)
    return container
  }
}
