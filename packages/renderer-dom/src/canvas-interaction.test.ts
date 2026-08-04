import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NOOP_RENDERER_CALLBACKS,
  createBoxNode,
  createFrameNode,
  type RenderContext,
  type RendererCallbacks,
} from '@framewright/core'
import { createCanvasInteraction, type CanvasInteraction } from './canvas-interaction'

let container: HTMLDivElement
let interaction: CanvasInteraction | null

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
      children: [createBoxNode({ fwId: 'nested', x: 5, y: 5, width: 10, height: 10 })],
    }),
  ],
})

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

function addTarget(fwId: string): HTMLElement {
  const element = document.createElement('div')
  element.dataset.fwId = fwId
  container.appendChild(element)
  return element
}

function pointer(
  target: EventTarget,
  type: string,
  x: number,
  y: number,
  init: MouseEventInit = {},
): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: type === 'pointermove' ? -1 : 0,
    buttons: type === 'pointerup' ? 0 : 1,
    clientX: x + 100,
    clientY: y + 50,
    ...init,
  })
  target.dispatchEvent(event)
  return event
}

function setup(ctx = makeContext()) {
  const onPreview = vi.fn()
  interaction = createCanvasInteraction(container, ctx, { onPreview })
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
    const box = addTarget('box-a')
    const { callbacks } = setup(makeContext(['box-b']))

    pointer(box, 'pointerdown', 15, 15)

    expect(callbacks.onSelectionRequest).toHaveBeenCalledOnce()
    expect(callbacks.onSelectionRequest).toHaveBeenCalledWith(['box-a'], 'replace')
  })

  it('已选中节点按下不重复请求，Shift 点击则在未超过阈值时切换它', () => {
    const box = addTarget('box-a')
    const { callbacks } = setup(makeContext(['box-a']))

    pointer(box, 'pointerdown', 15, 15, { shiftKey: true })
    expect(callbacks.onSelectionRequest).not.toHaveBeenCalled()
    pointer(window, 'pointerup', 18, 17, { shiftKey: true })

    expect(callbacks.onSelectionRequest).toHaveBeenCalledWith(['box-a'], 'toggle')
  })

  it.each(['root', 'locked', 'transparent-frame'])(
    '%s 的内部按空白处理，点击清空选中',
    (fwId) => {
      const target = addTarget(fwId)
      const { callbacks } = setup(makeContext(['box-a']))

      pointer(target, 'pointerdown', fwId === 'root' ? 200 : fwId === 'locked' ? 75 : 140, 15)
      pointer(window, 'pointerup', fwId === 'root' ? 200 : fwId === 'locked' ? 75 : 140, 15)

      expect(callbacks.onSelectionRequest).toHaveBeenCalledOnce()
      expect(callbacks.onSelectionRequest).toHaveBeenCalledWith([], 'replace')
    },
  )
})

describe('框选状态机', () => {
  it('超过 4 CSS px 后按相交收集，并只上报本次框中的最小集合', () => {
    const { callbacks, onPreview } = setup(makeContext(['nested']))

    pointer(container, 'pointerdown', 0, 0)
    pointer(window, 'pointermove', 12, 12)
    pointer(window, 'pointerup', 12, 12)

    expect(onPreview).toHaveBeenCalledWith({ marquee: { x: 0, y: 0, width: 12, height: 12 } })
    expect(callbacks.onSelectionRequest).toHaveBeenCalledOnce()
    expect(callbacks.onSelectionRequest).toHaveBeenCalledWith(['box-a'], 'replace')
  })

  it('恰好 4 CSS px 仍按空白点击处理，Shift 框选则用 add 并入', () => {
    const first = setup(makeContext(['box-b']))
    pointer(container, 'pointerdown', 0, 0)
    pointer(window, 'pointermove', 4, 0)
    pointer(window, 'pointerup', 4, 0)
    expect(first.callbacks.onSelectionRequest).toHaveBeenCalledWith([], 'replace')

    interaction?.destroy()
    const second = setup(makeContext(['box-b']))
    pointer(container, 'pointerdown', 5, 5, { shiftKey: true })
    pointer(window, 'pointermove', 32, 32, { shiftKey: true })
    pointer(window, 'pointerup', 32, 32, { shiftKey: true })
    expect(second.callbacks.onSelectionRequest).toHaveBeenCalledWith(['box-a'], 'add')
  })

  it('按 viewport 把屏幕点转成画布点后框选', () => {
    const callbacks = makeCallbacks()
    const ctx = {
      ...makeContext([], callbacks),
      viewport: { scale: 2, offsetX: 20, offsetY: 10 },
    }
    setup(ctx)

    pointer(container, 'pointerdown', 38, 28)
    pointer(window, 'pointermove', 82, 72)
    pointer(window, 'pointerup', 82, 72)

    expect(callbacks.onSelectionRequest).toHaveBeenCalledWith(['box-a'], 'replace')
  })
})
