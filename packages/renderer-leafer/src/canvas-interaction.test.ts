// @vitest-environment jsdom
// 🔴 任何 import leafer-ui 的测试文件必须把桩放在第一个 import（见桩内注释）
import './leafer-test-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NOOP_RENDERER_CALLBACKS,
  createBoxNode,
  createFrameNode,
  walkTree,
  type CanvasNode,
  type FrameNode,
  type RenderContext,
  type RendererCallbacks,
} from '@framewright/core'
import {
  createCanvasInteraction,
  EMPTY_CANVAS_HIT,
  type CanvasHitProbe,
  type CanvasInteraction,
} from './canvas-interaction'
import { createLeaferRenderer } from './index'
import type { RendererAdapter } from '@framewright/core'

// 本套件与 renderer-dom/src/canvas-interaction.test.ts 逐案对齐——
// 同一手势两侧行为分歧会污染选型对照结论，测试也必须镜像。
// 差异仅在「命中来源」：DOM 侧从 event.target 沿 closest() 解析，
// 这侧由 CanvasHitProbe 给出（生产实现是 leafer.selector.getByPoint，
// 见 hit-probe.test.ts；这里用几何桩替代，与 DOM 侧的 addTarget 等价）。

const root = createFrameNode({
  fwId: 'root',
  width: 300,
  height: 200,
  children: [
    createBoxNode({ fwId: 'box-a', x: 10, y: 10, width: 20, height: 20 }),
    createBoxNode({ fwId: 'box-b', x: 40, y: 10, width: 20, height: 20 }),
    createBoxNode({ fwId: 'locked', x: 70, y: 10, width: 20, height: 20, locked: true }),
    createFrameNode({
      fwId: 'transparent-frame',
      x: 100,
      y: 10,
      width: 60,
      height: 60,
      background: null,
      children: [
        createBoxNode({ fwId: 'nested', x: 5, y: 5, width: 10, height: 10 }),
        createBoxNode({ fwId: 'resize-node', x: 20, y: 20, width: 40, height: 20 }),
      ],
    }),
  ],
})

/** 几何桩探针：按「视觉最上层」（深度优先逆序）命中，等价 DOM 侧的 closest('[data-fw-id]')。 */
function geometricProbe(treeRoot: FrameNode): CanvasHitProbe {
  const zones: Array<{ x: number; y: number; width: number; height: number; fwId: string }> = []
  walkTree(treeRoot, (node: CanvasNode, absolute) => {
    zones.push({ x: absolute.x, y: absolute.y, width: node.width, height: node.height, fwId: node.fwId })
  })
  zones.reverse()
  return (screenPoint) => {
    const zone = zones.find(
      (z) =>
        screenPoint.x >= z.x &&
        screenPoint.x <= z.x + z.width &&
        screenPoint.y >= z.y &&
        screenPoint.y <= z.y + z.height,
    )
    return { ...EMPTY_CANVAS_HIT, fwId: zone?.fwId ?? null }
  }
}

let container: HTMLDivElement
let interaction: CanvasInteraction | null

function makeCallbacks(): RendererCallbacks {
  return {
    ...NOOP_RENDERER_CALLBACKS,
    onSelectionRequest: vi.fn(),
    onNodesMove: vi.fn(),
    onNodesResize: vi.fn(),
    onNodesDelete: vi.fn(),
    onNodeActivate: vi.fn(),
  }
}

function makeContext(
  selection: readonly string[] = [],
  callbacks = makeCallbacks(),
): RenderContext {
  return {
    root,
    selection,
    viewport: { scale: 1, offsetX: 0, offsetY: 0 },
    callbacks,
  }
}

function pointer(type: string, x: number, y: number, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: type === 'pointermove' ? -1 : 0,
    buttons: type === 'pointerup' ? 0 : 1,
    clientX: x + 100,
    clientY: y + 50,
    ...init,
  })
  const target = type === 'pointerdown' ? container : window
  target.dispatchEvent(event)
  return event
}

function setup(ctx = makeContext(), customProbe?: CanvasHitProbe) {
  const onPreview = vi.fn()
  const probe = customProbe ?? geometricProbe(ctx.root)
  interaction = createCanvasInteraction(container, probe, ctx, { onPreview })
  return { callbacks: ctx.callbacks, onPreview }
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    x: 100,
    y: 50,
    left: 100,
    top: 50,
    right: 400,
    bottom: 250,
    width: 300,
    height: 200,
    toJSON: () => ({}),
  })
  interaction = null
})

afterEach(() => {
  interaction?.destroy()
  container.remove()
  vi.restoreAllMocks()
})

describe('点选状态机', () => {
  it('未选中的业务单元在 pointerdown 时立即替换选中集', () => {
    const { callbacks } = setup(makeContext(['box-b']))

    pointer('pointerdown', 15, 15)

    expect(callbacks.onSelectionRequest).toHaveBeenCalledOnce()
    expect(callbacks.onSelectionRequest).toHaveBeenCalledWith(['box-a'], 'replace')
  })

  it('已选中节点按下不重复请求，Shift 点击则在未超过阈值时切换它', () => {
    const { callbacks } = setup(makeContext(['box-a']))

    pointer('pointerdown', 15, 15, { shiftKey: true })
    expect(callbacks.onSelectionRequest).not.toHaveBeenCalled()
    pointer('pointerup', 18, 17, { shiftKey: true })

    expect(callbacks.onSelectionRequest).toHaveBeenCalledWith(['box-a'], 'toggle')
  })

  it.each(['root', 'locked', 'transparent-frame'])(
    '%s 的内部按空白处理，点击清空选中',
    (fwId) => {
      const { callbacks } = setup(makeContext(['box-a']))
      const point = fwId === 'root' ? { x: 200, y: 15 } : fwId === 'locked' ? { x: 75, y: 15 } : { x: 140, y: 15 }

      pointer('pointerdown', point.x, point.y)
      pointer('pointerup', point.x, point.y)

      expect(callbacks.onSelectionRequest).toHaveBeenCalledOnce()
      expect(callbacks.onSelectionRequest).toHaveBeenCalledWith([], 'replace')
    },
  )

  it('命中内部动作按钮时不启动任何手势（不参与选中/框选）', () => {
    const internalProbe: CanvasHitProbe = () => ({
      ...EMPTY_CANVAS_HIT,
      fwId: 'box-a',
      internalAction: true,
    })
    const { callbacks, onPreview } = setup(makeContext(['box-b']), internalProbe)

    pointer('pointerdown', 15, 15)
    pointer('pointermove', 25, 25)
    pointer('pointerup', 25, 25)

    expect(callbacks.onSelectionRequest).not.toHaveBeenCalled()
    expect(callbacks.onNodesMove).not.toHaveBeenCalled()
    expect(onPreview).not.toHaveBeenCalled()
  })
})

describe('框选状态机', () => {
  it('超过 4 CSS px 后按相交收集，并只上报本次框中的最小集合', () => {
    const { callbacks, onPreview } = setup(makeContext(['nested']))

    pointer('pointerdown', 0, 0)
    pointer('pointermove', 12, 12)
    pointer('pointerup', 12, 12)

    expect(onPreview).toHaveBeenCalledWith({ marquee: { x: 0, y: 0, width: 12, height: 12 } })
    expect(callbacks.onSelectionRequest).toHaveBeenCalledOnce()
    expect(callbacks.onSelectionRequest).toHaveBeenCalledWith(['box-a'], 'replace')
  })

  it('恰好 4 CSS px 仍按空白点击处理，Shift 框选则用 add 并入', () => {
    const first = setup(makeContext(['box-b']))
    pointer('pointerdown', 0, 0)
    pointer('pointermove', 4, 0)
    pointer('pointerup', 4, 0)
    expect(first.callbacks.onSelectionRequest).toHaveBeenCalledWith([], 'replace')

    interaction?.destroy()
    const second = setup(makeContext(['box-b']))
    pointer('pointerdown', 5, 5, { shiftKey: true })
    pointer('pointermove', 32, 32, { shiftKey: true })
    pointer('pointerup', 32, 32, { shiftKey: true })
    expect(second.callbacks.onSelectionRequest).toHaveBeenCalledWith(['box-a'], 'add')
  })

  it('按 viewport 把屏幕点转成画布点后框选', () => {
    const callbacks = makeCallbacks()
    const ctx = {
      ...makeContext([], callbacks),
      viewport: { scale: 2, offsetX: 20, offsetY: 10 },
    }
    setup(ctx)

    pointer('pointerdown', 38, 28)
    pointer('pointermove', 82, 72)
    pointer('pointerup', 82, 72)

    expect(callbacks.onSelectionRequest).toHaveBeenCalledWith(['box-a'], 'replace')
  })
})

describe('D2-leafer 挂载接线（真实渲染器 + 真实命中探针）', () => {
  let renderer: RendererAdapter | null

  afterEach(() => {
    renderer?.destroy()
    renderer = null
  })

  it('点选经真实场景图命中上报 onSelectionRequest', () => {
    const callbacks = makeCallbacks()
    renderer = createLeaferRenderer()
    renderer.mount(container, makeContext([], callbacks))

    pointer('pointerdown', 15, 15)

    expect(callbacks.onSelectionRequest).toHaveBeenCalledOnce()
    expect(callbacks.onSelectionRequest).toHaveBeenCalledWith(['box-a'], 'replace')
  })

  it('框选松手上报最小集合（overlay 结构断言见 interaction-overlay.test.ts）', () => {
    const callbacks = makeCallbacks()
    renderer = createLeaferRenderer()
    renderer.mount(container, makeContext(['nested'], callbacks))

    pointer('pointerdown', 0, 0)
    pointer('pointermove', 12, 12)
    pointer('pointerup', 12, 12)

    expect(callbacks.onSelectionRequest).toHaveBeenCalledOnce()
    expect(callbacks.onSelectionRequest).toHaveBeenCalledWith(['box-a'], 'replace')
  })
})
