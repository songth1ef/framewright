// @vitest-environment jsdom
// 🔴 任何 import leafer-ui 的测试文件必须把桩放在第一个 import（见桩内注释）
import '../leafer-test-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createVideoNode } from '@framewright/core'
import { Leafer, PointerEvent, type IPointerEvent, type IUI } from 'leafer-ui'
import { hitTestVideoControls, layoutVideoControls } from './player-controls'
import { createVideoShape } from './video-node'
import {
  getOrCreateVideoSource,
  releaseVideoRegistryForTest,
  setVideoElementFactoryForTest,
} from './video-paint'
import type { VideoElementLike } from './video-source'

/**
 * 控制条 tap 的坐标换算一致性（清账：architecture.md 记的 hitByViewLocal 恒 null）。
 *
 * 结论先行：view-local 不是一条「没修好的第二路径」，而是把**世界坐标**直接喂给了
 * **容器坐标系**的 hitTest——容器不在原点时必然落空，null 是构造出来的。
 * src 里同形状的地雷是 tap handler 的兜底分支 `?? { x: event.x, y: event.y }`：
 * event.x/y 是 world 坐标，fallback 一旦触发就是同一个错。
 *
 * 本文件断言：两条**合法**换算路径（事件 API 与显式 leaf 换算）对同一物理点
 * 结果一致；且事件对象缺 getInnerPoint 时 handler 行为不分裂。
 */

class SilentVideoElement implements VideoElementLike {
  src = ''
  loop = false
  volume = 1
  currentTime = 0
  duration = 0
  paused = true
  ended = false
  videoWidth = 0
  videoHeight = 0
  play(): void {}
  pause(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
}

beforeEach(() => {
  setVideoElementFactoryForTest(() => new SilentVideoElement())
})

afterEach(() => {
  releaseVideoRegistryForTest()
})

const NODE = { x: 100, y: 80, width: 320, height: 240 }
const SEEK_MID = { type: 'seek', fraction: 0.5 } as const

function setup(leaferConfig?: { scale: number; x: number; y: number }) {
  const leafer = new Leafer()
  if (leaferConfig) {
    leafer.scale = leaferConfig.scale
    leafer.x = leaferConfig.x
    leafer.y = leaferConfig.y
  }
  const node = createVideoNode({
    fwId: 'video-tap',
    ...NODE,
    src: 'http://probe.local/tap.webm',
    poster: null,
    fit: 'contain',
  })
  const ui = createVideoShape()({
    node,
    position: { x: NODE.x, y: NODE.y },
    selected: false,
  })
  leafer.add(ui)
  return { leafer, ui }
}

/** 进度轨中点：容器坐标与世界坐标（世界坐标由 leaf 自己换算，含视口 transform） */
function trackMid(ui: IUI) {
  const layout = layoutVideoControls(NODE.width, NODE.height)
  const local = {
    x: layout.progressTrack.x + layout.progressTrack.width / 2,
    y: layout.progressTrack.y + layout.progressTrack.height / 2,
  }
  return { layout, local, world: ui.getWorldPoint(local) }
}

function barOf(ui: IUI): IUI {
  const bar = (ui as unknown as { children: IUI[] }).children.find(
    (child) => (child.data as Record<string, unknown> | undefined)?.['fwVideoControl'] === true,
  )
  if (!bar) throw new Error('控制条不存在')
  return bar
}

describe('视频控制条 tap 坐标换算', () => {
  it('两条合法换算路径对同一世界点结果一致；world 坐标直接命中必为空', () => {
    const { leafer, ui } = setup()
    const { layout, world } = trackMid(ui)

    // 路径 A：事件 API（生产 handler 主路径）
    const event = new PointerEvent({ type: PointerEvent.TAP, x: world.x, y: world.y })
    const byEvent = hitTestVideoControls(layout, event.getInnerPoint!(ui))
    // 路径 B：显式 leaf 换算（handler 兜底路径，也是探针当年「应该」做的换算）
    const byManual = hitTestVideoControls(layout, ui.getInnerPoint({ x: world.x, y: world.y }))

    expect(byEvent).toEqual(SEEK_MID)
    expect(byManual).toEqual(byEvent)
    // 反例锁定：world 坐标不换算直接喂容器坐标系的 hitTest（旧 hitByViewLocal 语义）
    // ——必然 null。它从来不是「第二条路径」，而是坐标系用错，不允许再出现。
    expect(hitTestVideoControls(layout, { x: world.x, y: world.y })).toBeNull()
    leafer.destroy()
  })

  it('带视口 scale/pan 时两条路径仍一致', () => {
    const { leafer, ui } = setup({ scale: 2, x: 30, y: -12 })
    const { layout, world } = trackMid(ui)

    const event = new PointerEvent({ type: PointerEvent.TAP, x: world.x, y: world.y })
    const byEvent = hitTestVideoControls(layout, event.getInnerPoint!(ui))
    const byManual = hitTestVideoControls(layout, ui.getInnerPoint({ x: world.x, y: world.y }))

    expect(byEvent).toEqual(SEEK_MID)
    expect(byManual).toEqual(byEvent)
    leafer.destroy()
  })

  it('真实 handler：非原点节点上 emit 真实 PointerEvent，命中 seek(0.5)', () => {
    const { leafer, ui } = setup()
    const { world } = trackMid(ui)
    const source = getOrCreateVideoSource('http://probe.local/tap.webm')
    const spy = vi.spyOn(source, 'seekToFraction')

    barOf(ui).emit(
      PointerEvent.TAP,
      new PointerEvent({ type: PointerEvent.TAP, x: world.x, y: world.y }),
    )
    expect(spy).toHaveBeenCalledWith(0.5)
    leafer.destroy()
  })

  it('真实 handler：事件对象缺 getInnerPoint 时兜底换算结果不分裂', () => {
    const { leafer, ui } = setup()
    const { world } = trackMid(ui)
    const source = getOrCreateVideoSource('http://probe.local/tap.webm')
    const spy = vi.spyOn(source, 'seekToFraction')

    // 只有 x/y（world 坐标）、没有 getInnerPoint 的事件对象——IUIEvent 类型允许这种形态。
    // 修复前：兜底把 world 坐标直接喂 hitTest → 静默落空；修复后：走同一世界→容器换算。
    barOf(ui).emit(PointerEvent.TAP, { x: world.x, y: world.y } as unknown as IPointerEvent)
    expect(spy).toHaveBeenCalledWith(0.5)
    leafer.destroy()
  })
})
