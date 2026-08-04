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
      children: [
        createBoxNode({ fwId: 'nested', x: 5, y: 5, width: 10, height: 10 }),
        createBoxNode({ fwId: 'resize-node', x: 20, y: 20, width: 40, height: 20 }),
      ],
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

function addResizeHandle(fwId: string, corner: 'nw' | 'ne' | 'sw' | 'se'): HTMLElement {
  const element = document.createElement('div')
  element.dataset.fwResizeHandle = corner
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

describe('节点拖拽移动', () => {
  it('超过 4 CSS px 后逐帧只预览，pointerup 才提交一次父相对坐标', () => {
    const box = addTarget('box-a')
    const { callbacks, onPreview } = setup(makeContext(['box-a']))

    pointer(box, 'pointerdown', 15, 15)
    pointer(window, 'pointermove', 25, 20)

    expect(onPreview).toHaveBeenLastCalledWith({
      moves: [{ fwId: 'box-a', parentFwId: 'root', x: 20, y: 15 }],
    })
    expect(callbacks.onNodesMove).not.toHaveBeenCalled()

    pointer(window, 'pointerup', 30, 25)
    expect(callbacks.onNodesMove).toHaveBeenCalledOnce()
    expect(callbacks.onNodesMove).toHaveBeenCalledWith([
      { fwId: 'box-a', parentFwId: 'root', x: 25, y: 20 },
    ])
  })

  it('拖未选节点时用 pointerdown 得到的新选中集移动，不拖旧选中集', () => {
    const nested = addTarget('nested')
    const { callbacks } = setup(makeContext(['box-b']))

    pointer(nested, 'pointerdown', 106, 16)
    pointer(window, 'pointermove', 116, 26)
    pointer(window, 'pointerup', 116, 26)

    expect(callbacks.onSelectionRequest).toHaveBeenNthCalledWith(1, ['nested'], 'replace')
    expect(callbacks.onNodesMove).toHaveBeenCalledWith([
      { fwId: 'nested', parentFwId: 'transparent-frame', x: 15, y: 15 },
    ])
  })

  it('未超过阈值不提交移动，pointercancel 丢弃预览且不提交', () => {
    const box = addTarget('box-a')
    const { callbacks, onPreview } = setup(makeContext(['box-a']))

    pointer(box, 'pointerdown', 15, 15)
    pointer(window, 'pointermove', 19, 15)
    pointer(window, 'pointerup', 19, 15)
    expect(callbacks.onNodesMove).not.toHaveBeenCalled()

    pointer(box, 'pointerdown', 15, 15)
    pointer(window, 'pointermove', 25, 20)
    pointer(window, 'pointercancel', 25, 20)
    expect(callbacks.onNodesMove).not.toHaveBeenCalled()
    expect(onPreview).toHaveBeenLastCalledWith({})
  })
})

describe('单选等比缩放', () => {
  it('拖动四角控制点只预览，pointerup 才提交一次父相对坐标', () => {
    const handle = addResizeHandle('resize-node', 'se')
    const { callbacks, onPreview } = setup(makeContext(['resize-node']))

    pointer(handle, 'pointerdown', 160, 50)
    pointer(window, 'pointermove', 200, 70)

    expect(onPreview).toHaveBeenLastCalledWith({
      resizes: [
        {
          fwId: 'resize-node',
          parentFwId: 'transparent-frame',
          x: 20,
          y: 20,
          width: 80,
          height: 40,
        },
      ],
    })
    expect(callbacks.onNodesResize).not.toHaveBeenCalled()

    pointer(window, 'pointerup', 220, 80)
    expect(callbacks.onNodesResize).toHaveBeenCalledOnce()
    expect(callbacks.onNodesResize).toHaveBeenCalledWith([
      {
        fwId: 'resize-node',
        parentFwId: 'transparent-frame',
        x: 20,
        y: 20,
        width: 100,
        height: 50,
      },
    ])
  })

  it('使用 core 的 32 画布 px 最小尺寸钳制', () => {
    const handle = addResizeHandle('box-a', 'se')
    const { callbacks } = setup(makeContext(['box-a']))

    pointer(handle, 'pointerdown', 30, 30)
    pointer(window, 'pointermove', 11, 11)
    pointer(window, 'pointerup', 11, 11)

    expect(callbacks.onNodesResize).toHaveBeenCalledWith([
      { fwId: 'box-a', parentFwId: 'root', x: 10, y: 10, width: 32, height: 32 },
    ])
  })

  it('多选不启动缩放，pointercancel 丢弃缩放预览且不提交', () => {
    const handle = addResizeHandle('box-a', 'nw')
    const multi = setup(makeContext(['box-a', 'box-b']))
    pointer(handle, 'pointerdown', 10, 10)
    pointer(window, 'pointermove', 0, 0)
    pointer(window, 'pointerup', 0, 0)
    expect(multi.callbacks.onNodesResize).not.toHaveBeenCalled()

    interaction?.destroy()
    const single = setup(makeContext(['box-a']))
    pointer(handle, 'pointerdown', 10, 10)
    pointer(window, 'pointermove', 0, 0)
    pointer(window, 'pointercancel', 0, 0)
    expect(single.callbacks.onNodesResize).not.toHaveBeenCalled()
    expect(single.onPreview).toHaveBeenLastCalledWith({})
  })
})
