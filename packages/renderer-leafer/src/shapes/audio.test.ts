// @vitest-environment jsdom
// 🔴 任何 import leafer-ui 的测试文件必须把桩放在第一个 import（见桩内注释）
import '../leafer-test-stub'
import { createAudioNode } from '@framewright/core'
import { Box, Text, type IUI } from 'leafer-ui'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VIDEO_CONTROLS_STYLE } from '../video/player-controls'
import { releaseVideoRegistryForTest, setVideoElementFactoryForTest } from '../video/video-paint'
import type { VideoElementLike } from '../video/video-source'
import { createAudioShape } from './audio'
import { updateLeaferShape } from './registry'

function fixture(init: Partial<Parameters<typeof createAudioNode>[0]> = {}) {
  return createAudioNode({
    fwId: 'audio-1',
    name: '主题音乐',
    x: 10,
    y: 20,
    width: 320,
    height: 120,
    rotation: 5,
    opacity: 0.75,
    locked: true,
    src: 'http://probe.local/theme.mp3',
    ...init,
  })
}

class SilentMediaElement implements VideoElementLike {
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

beforeEach(() => setVideoElementFactoryForTest(() => new SilentMediaElement()))
afterEach(() => releaseVideoRegistryForTest())

const childrenOf = (ui: IUI): IUI[] => (ui as unknown as { children: IUI[] }).children

describe('createAudioShape', () => {
  it('有 src 时渲染深色卡片、音频标识、名称与 video 同口径控制条', () => {
    const ui = createAudioShape()({
      node: fixture(),
      position: { x: 10, y: 20 },
      selected: false,
    })

    expect(ui).toBeInstanceOf(Box)
    expect(ui.x).toBe(10)
    expect(ui.y).toBe(20)
    expect(ui.width).toBe(320)
    expect(ui.height).toBe(120)
    expect(ui.fill).toBe('#171A21')
    const children = childrenOf(ui)
    expect(children.some((child) => child instanceof Text && child.text === '♫')).toBe(true)
    expect(children.some((child) => child instanceof Text && child.text === '主题音乐')).toBe(true)
    const bar = children.find(
      (child) => (child.data as Record<string, unknown> | undefined)?.['fwVideoControl'] === true,
    )
    expect(bar).toBeDefined()
    expect(bar!.y).toBe(120 - VIDEO_CONTROLS_STYLE.barHeight)
  })

  it('无 src 时渲染与 img/video 同口径的稳定占位', () => {
    const ui = createAudioShape()({
      node: fixture({ src: '' }),
      position: { x: 0, y: 0 },
      selected: false,
    })

    expect(ui.fill).toBe('#DDDDDD')
    expect(ui.stroke).toBe('#999999')
    expect(ui.dashPattern).toEqual([4, 4])
    expect(childrenOf(ui)).toHaveLength(0)
  })

  it('不泄漏：容器与子节点均不接收 node 内部字段', () => {
    const ui = createAudioShape()({
      node: fixture(),
      position: { x: 0, y: 0 },
      selected: false,
    })

    for (const element of [ui, ...childrenOf(ui)]) {
      const raw = element as unknown as Record<string, unknown>
      expect(raw['fwId']).toBeUndefined()
      expect(raw['fwType']).toBeUndefined()
      expect(raw['locked']).not.toBe(true)
      expect(raw['name']).not.toBe('主题音乐')
    }
  })

  it('内容更新时保留外层 Leafer 实例并原地 set', () => {
    const previous = fixture()
    const ui = createAudioShape()({
      node: previous,
      position: { x: 10, y: 20 },
      selected: false,
    })
    const identity = ui
    const next = fixture({ name: '环境音', x: 30, src: 'http://probe.local/ambient.mp3' })

    updateLeaferShape(ui, previous, 'full', {
      node: next,
      position: { x: 30, y: 20 },
      selected: false,
    })

    expect(ui).toBe(identity)
    expect(ui.x).toBe(30)
    expect(childrenOf(ui).some((child) => child instanceof Text && child.text === '环境音')).toBe(true)
  })

  it('拒绝非 audio 节点', () => {
    const factory = createAudioShape()
    expect(() =>
      factory({
        node: { ...fixture(), fwType: 'box' } as never,
        position: { x: 0, y: 0 },
        selected: false,
      }),
    ).toThrow()
  })
})
