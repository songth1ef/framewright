// @vitest-environment jsdom
// 🔴 任何 import leafer-ui 的测试文件必须把桩放在第一个 import（见桩内注释）
import '../leafer-test-stub'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createVideoNode } from '@framewright/core'
import { Box, Rect, type IUI } from 'leafer-ui'
import { VIDEO_CONTROLS_STYLE } from './player-controls'
import { releaseVideoRegistryForTest, setVideoElementFactoryForTest } from './video-paint'
import { createVideoShape } from './video-node'
import type { VideoElementLike } from './video-source'

// video shape（C3-leafer）：结构断言 + 「不泄漏」断言（AGENTS.md §8）。
// 播放行为本身由真实浏览器 probe 覆盖，这里只验证场景图结构与逐字段映射。

// 测试用 fixture（🔴 不用 packages/core 的 demo-document——那是两个渲染器共用的）
function fixture(init: Partial<Parameters<typeof createVideoNode>[0]> = {}) {
  return createVideoNode({
    fwId: 'video-1',
    x: 10,
    y: 20,
    width: 320,
    height: 240,
    src: 'http://probe.local/fixture.webm',
    poster: null,
    fit: 'contain',
    ...init,
  })
}

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

const childrenOf = (ui: IUI): IUI[] => (ui as unknown as { children: IUI[] }).children

describe('createVideoShape', () => {
  it('拒绝非 video 节点', () => {
    const factory = createVideoShape()
    expect(() =>
      factory({ node: { ...fixture(), fwType: 'box' } as never, position: { x: 0, y: 0 }, selected: false }),
    ).toThrow()
  })

  it('结构：Box 容器 + 视频画面 + 自绘控制条', () => {
    const factory = createVideoShape()
    const ui = factory({ node: fixture(), position: { x: 10, y: 20 }, selected: false })
    expect(ui).toBeInstanceOf(Box)
    expect(ui.x).toBe(10)
    expect(ui.y).toBe(20)

    const children = childrenOf(ui)
    const screen = children[0] as Rect
    expect(screen).toBeInstanceOf(Rect)
    const fill = screen.fill as unknown as Record<string, unknown>
    expect(fill).toEqual({
      type: 'video',
      url: 'http://probe.local/fixture.webm',
      mode: 'fit',
      changeful: true,
    })

    // 控制条存在且带 fwVideoControl 标记（命中探针据此排除画布手势）
    const bar = children.find(
      (child) => (child.data as Record<string, unknown> | undefined)?.['fwVideoControl'] === true,
    )
    expect(bar).toBeDefined()
    expect(bar!.y).toBe(240 - VIDEO_CONTROLS_STYLE.barHeight)
  })

  it('fit 映射：contain→fit / cover→cover / fill→stretch', () => {
    const factory = createVideoShape()
    for (const [fit, mode] of [
      ['contain', 'fit'],
      ['cover', 'cover'],
      ['fill', 'stretch'],
    ] as const) {
      const ui = factory({ node: fixture({ fit }), position: { x: 0, y: 0 }, selected: false })
      const screen = childrenOf(ui)[0] as Rect
      expect((screen.fill as unknown as Record<string, unknown>)['mode']).toBe(mode)
    }
  })

  it('不泄漏：fill 只有四个白名单字段，容器属性不含 node 内部字段', () => {
    const factory = createVideoShape()
    const ui = factory({ node: fixture(), position: { x: 0, y: 0 }, selected: false })
    const screen = childrenOf(ui)[0] as Rect
    expect(Object.keys(screen.fill as unknown as Record<string, unknown>).sort()).toEqual(
      ['changeful', 'mode', 'type', 'url'].sort(),
    )
    const raw = ui as unknown as Record<string, unknown>
    expect(raw['fwType']).toBeUndefined()
    expect(raw['fwId']).toBeUndefined()
    // 注：不断言 locked——Leafer UI 有同名原生属性（默认 false），不是 node 字段泄漏
  })

  it('装饰性控件不可命中（hittable:false），交互集中在控制条', () => {
    const factory = createVideoShape()
    const ui = factory({ node: fixture(), position: { x: 0, y: 0 }, selected: false })
    const bar = childrenOf(ui).find(
      (child) => (child.data as Record<string, unknown> | undefined)?.['fwVideoControl'] === true,
    )!
    const decorative = childrenOf(ui).filter(
      (child) =>
        child !== bar &&
        child !== childrenOf(ui)[0] &&
        (child.data as Record<string, unknown> | undefined)?.['fwVideoControl'] !== true,
    )
    expect(decorative.length).toBeGreaterThan(0)
    for (const child of decorative) {
      expect((child as unknown as { hittable: boolean }).hittable).toBe(false)
    }
  })
})
