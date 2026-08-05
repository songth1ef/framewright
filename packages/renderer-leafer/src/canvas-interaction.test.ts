// @vitest-environment jsdom
// 🔴 任何 import leafer-ui 的测试文件必须把桩放在第一个 import（见桩内注释）
import './leafer-test-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NOOP_RENDERER_CALLBACKS,
  createBoxNode,
  createFrameNode,
  findNodeById,
  getAbsolutePosition,
  walkTree,
  type CanvasNode,
  type Corner,
  type FrameNode,
  type Point,
  type RenderContext,
  type RendererCallbacks,
} from '@framewright/core'
import {
  createCanvasInteraction,
  EMPTY_CANVAS_HIT,
  resolveSelectableHit,
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

/** 在几何桩上叠加一个缩放控制点命中区（节点角点 ±4px），等价 DOM 侧的 addResizeHandle。 */
function withHandleZone(base: CanvasHitProbe, fwId: string, corner: Corner): CanvasHitProbe {
  const node = findNodeById(root, fwId)
  const absolute = getAbsolutePosition(root, fwId)
  if (node === null || absolute === null) throw new Error(`节点不存在: ${fwId}`)
  const cx = corner === 'ne' || corner === 'se' ? absolute.x + node.width : absolute.x
  const cy = corner === 'sw' || corner === 'se' ? absolute.y + node.height : absolute.y
  return (screenPoint) => {
    if (Math.abs(screenPoint.x - cx) <= 4 && Math.abs(screenPoint.y - cy) <= 4) {
      return { ...EMPTY_CANVAS_HIT, fwId, resizeHandle: { fwId, corner } }
    }
    return base(screenPoint)
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
  interactionMode: RenderContext['interactionMode'] = 'unified',
): RenderContext {
  return {
    root,
    selection,
    interactionMode,
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

function keydown(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    code: key === ' ' ? 'Space' : key,
    bubbles: true,
    cancelable: true,
    ...init,
  })
  window.dispatchEvent(event)
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
    const { callbacks } = setup(makeContext(['box-b']), internalProbe)

    pointer('pointerdown', 15, 15)
    pointer('pointermove', 25, 25)
    pointer('pointerup', 25, 25)

    expect(callbacks.onSelectionRequest).not.toHaveBeenCalled()
    expect(callbacks.onNodesMove).not.toHaveBeenCalled()
  })
})

describe('native 拾取', () => {
  it('两种模式在同一位置返回相同最终 id', () => {
    const canvasPoint = { x: 15, y: 15 }

    expect(
      resolveSelectableHit({
        root,
        interactionMode: 'unified',
        candidateFwId: 'box-a',
        canvasPoint,
        development: true,
      }),
    ).toBe('box-a')
    expect(
      resolveSelectableHit({
        root,
        interactionMode: 'native',
        candidateFwId: 'box-a',
        canvasPoint,
        development: true,
      }),
    ).toBe('box-a')
  })

  it('native 候选取自探针的场景图拾取结果，点击即选中', () => {
    const { callbacks } = setup(makeContext([], makeCallbacks(), 'native'))

    pointer('pointerdown', 15, 15)

    expect(callbacks.onSelectionRequest).toHaveBeenCalledOnce()
    expect(callbacks.onSelectionRequest).toHaveBeenCalledWith(['box-a'], 'replace')
  })

  it.each(['locked', 'transparent-frame'])(
    '%s 候选仍由 core 统一过滤为空白',
    (fwId) => {
      const { callbacks } = setup(makeContext(['box-a'], makeCallbacks(), 'native'))
      const point = fwId === 'locked' ? { x: 75, y: 15 } : { x: 140, y: 15 }

      pointer('pointerdown', point.x, point.y)
      pointer('pointerup', point.x, point.y)

      expect(callbacks.onSelectionRequest).toHaveBeenCalledOnce()
      expect(callbacks.onSelectionRequest).toHaveBeenCalledWith([], 'replace')
    },
  )

  it('update(ctx) 后立即从 unified 切到 native，无需重新挂载', () => {
    const unifiedCallbacks = makeCallbacks()
    setup(makeContext([], unifiedCallbacks, 'unified'))

    pointer('pointerdown', 15, 15)
    pointer('pointerup', 15, 15)
    expect(unifiedCallbacks.onSelectionRequest).toHaveBeenCalledWith(['box-a'], 'replace')

    const nativeCallbacks = makeCallbacks()
    interaction?.update(makeContext([], nativeCallbacks, 'native'))
    pointer('pointerdown', 45, 15)

    expect(nativeCallbacks.onSelectionRequest).toHaveBeenCalledWith(['box-b'], 'replace')
  })

  it('开发态 native 严格比较同渲染器的 unified 结果并记录完整诊断', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(() =>
      resolveSelectableHit({
        root,
        interactionMode: 'native',
        candidateFwId: 'box-b',
        canvasPoint: { x: 15, y: 15 },
        development: true,
      }),
    ).toThrow('Leafer native 拾取与 unified 拾取不一致')
    expect(error).toHaveBeenCalledWith(
      'Leafer native 拾取与 unified 拾取不一致',
      {
        rendererId: 'leafer',
        canvasPoint: { x: 15, y: 15 },
        nativeCandidateFwId: 'box-b',
        unifiedCandidateFwId: 'box-a',
        nativeFwId: 'box-b',
        unifiedFwId: 'box-a',
      },
    )
  })

  it('生产态 native 不执行 unified 几何查询', () => {
    const canvasPoint = {} as Point
    Object.defineProperties(canvasPoint, {
      x: { get: () => { throw new Error('不应读取 x') } },
      y: { get: () => { throw new Error('不应读取 y') } },
    })

    expect(
      resolveSelectableHit({
        root,
        interactionMode: 'native',
        candidateFwId: 'box-a',
        canvasPoint,
        development: false,
      }),
    ).toBe('box-a')
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

describe('节点拖拽移动', () => {
  it('超过 4 CSS px 后逐帧只预览，pointerup 才提交一次父相对坐标', () => {
    const { callbacks, onPreview } = setup(makeContext(['box-a']))

    pointer('pointerdown', 15, 15)
    pointer('pointermove', 25, 20)

    expect(onPreview).toHaveBeenLastCalledWith({
      moves: [{ fwId: 'box-a', parentFwId: 'root', x: 20, y: 15 }],
    })
    expect(callbacks.onNodesMove).not.toHaveBeenCalled()

    pointer('pointerup', 30, 25)
    expect(callbacks.onNodesMove).toHaveBeenCalledOnce()
    expect(callbacks.onNodesMove).toHaveBeenCalledWith([
      { fwId: 'box-a', parentFwId: 'root', x: 25, y: 20 },
    ])
  })

  it('拖未选节点时用 pointerdown 得到的新选中集移动，不拖旧选中集', () => {
    const { callbacks } = setup(makeContext(['box-b']))

    pointer('pointerdown', 106, 16)
    pointer('pointermove', 116, 26)
    pointer('pointerup', 116, 26)

    expect(callbacks.onSelectionRequest).toHaveBeenNthCalledWith(1, ['nested'], 'replace')
    expect(callbacks.onNodesMove).toHaveBeenCalledWith([
      { fwId: 'nested', parentFwId: 'transparent-frame', x: 15, y: 15 },
    ])
  })

  it('未超过阈值不提交移动，pointercancel 丢弃预览且不提交', () => {
    const { callbacks, onPreview } = setup(makeContext(['box-a']))

    pointer('pointerdown', 15, 15)
    pointer('pointermove', 19, 15)
    pointer('pointerup', 19, 15)
    expect(callbacks.onNodesMove).not.toHaveBeenCalled()

    pointer('pointerdown', 15, 15)
    pointer('pointermove', 25, 20)
    pointer('pointercancel', 25, 20)
    expect(callbacks.onNodesMove).not.toHaveBeenCalled()
    expect(onPreview).toHaveBeenLastCalledWith({})
  })
})

describe('单选等比缩放', () => {
  it('拖动四角控制点只预览，pointerup 才提交一次父相对坐标', () => {
    const { callbacks, onPreview } = setup(
      makeContext(['resize-node']),
      withHandleZone(geometricProbe(root), 'resize-node', 'se'),
    )

    pointer('pointerdown', 160, 50)
    pointer('pointermove', 200, 70)

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

    pointer('pointerup', 220, 80)
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
    const { callbacks } = setup(
      makeContext(['box-a']),
      withHandleZone(geometricProbe(root), 'box-a', 'se'),
    )

    pointer('pointerdown', 30, 30)
    pointer('pointermove', 11, 11)
    pointer('pointerup', 11, 11)

    expect(callbacks.onNodesResize).toHaveBeenCalledWith([
      { fwId: 'box-a', parentFwId: 'root', x: 10, y: 10, width: 32, height: 32 },
    ])
  })

  it('多选不启动缩放，pointercancel 丢弃缩放预览且不提交', () => {
    const multi = setup(
      makeContext(['box-a', 'box-b']),
      withHandleZone(geometricProbe(root), 'box-a', 'nw'),
    )
    pointer('pointerdown', 10, 10)
    pointer('pointermove', 0, 0)
    pointer('pointerup', 0, 0)
    expect(multi.callbacks.onNodesResize).not.toHaveBeenCalled()

    interaction?.destroy()
    const single = setup(
      makeContext(['box-a']),
      withHandleZone(geometricProbe(root), 'box-a', 'nw'),
    )
    pointer('pointerdown', 10, 10)
    pointer('pointermove', 0, 0)
    pointer('pointercancel', 0, 0)
    expect(single.callbacks.onNodesResize).not.toHaveBeenCalled()
    expect(single.onPreview).toHaveBeenLastCalledWith({})
  })
})

describe('键盘操作', () => {
  it('方向键移动 1px，Shift + 方向键移动 10px', () => {
    const { callbacks } = setup(makeContext(['nested']))

    keydown('ArrowRight')
    keydown('ArrowDown', { shiftKey: true })

    expect(callbacks.onNodesMove).toHaveBeenNthCalledWith(1, [
      { fwId: 'nested', parentFwId: 'transparent-frame', x: 6, y: 5 },
    ])
    expect(callbacks.onNodesMove).toHaveBeenNthCalledWith(2, [
      { fwId: 'nested', parentFwId: 'transparent-frame', x: 5, y: 15 },
    ])
  })

  it('Delete/Backspace 删除选中集，Ctrl+A 阻止浏览器默认行为并全选可选节点', () => {
    const { callbacks } = setup(makeContext(['box-a', 'box-b']))

    keydown('Delete')
    keydown('Backspace')
    const selectAll = keydown('a', { code: 'KeyA', ctrlKey: true })

    expect(callbacks.onNodesDelete).toHaveBeenNthCalledWith(1, ['box-a', 'box-b'])
    expect(callbacks.onNodesDelete).toHaveBeenNthCalledWith(2, ['box-a', 'box-b'])
    expect(selectAll.defaultPrevented).toBe(true)
    expect(callbacks.onSelectionRequest).toHaveBeenCalledWith(
      ['box-a', 'box-b', 'transparent-frame', 'nested', 'resize-node'],
      'replace',
    )
  })

  it('Esc 清空选中并取消手势预览，IME composing 时不处理快捷键', () => {
    const { callbacks, onPreview } = setup(makeContext(['box-a']))
    pointer('pointerdown', 15, 15)
    pointer('pointermove', 25, 20)

    keydown('Escape')
    keydown('Delete', { isComposing: true })

    expect(onPreview).toHaveBeenLastCalledWith({})
    expect(callbacks.onSelectionRequest).toHaveBeenCalledWith([], 'replace')
    expect(callbacks.onNodesDelete).not.toHaveBeenCalled()
  })

  it.each([
    ['input', document.createElement('input')],
    ['textarea', document.createElement('textarea')],
    ['contenteditable', Object.assign(document.createElement('div'), { contentEditable: 'true', tabIndex: 0 })],
  ])('document.activeElement 在 %s 时方向键、Delete 与 Ctrl+A 均不劫持', (_name, editable) => {
    container.appendChild(editable)
    editable.focus()
    expect(document.activeElement).toBe(editable)
    const { callbacks } = setup(makeContext(['box-a']))

    keydown('ArrowLeft')
    keydown('Delete')
    const selectAll = keydown('a', { code: 'KeyA', ctrlKey: true })

    expect(callbacks.onNodesMove).not.toHaveBeenCalled()
    expect(callbacks.onNodesDelete).not.toHaveBeenCalled()
    expect(callbacks.onSelectionRequest).not.toHaveBeenCalled()
    expect(selectAll.defaultPrevented).toBe(false)
  })
})

describe('光标与悬停反馈', () => {
  it('空白、业务单元与四角控制点使用对应光标', () => {
    setup(
      makeContext(['box-a']),
      withHandleZone(
        withHandleZone(geometricProbe(root), 'box-a', 'nw'),
        'box-a',
        'ne',
      ),
    )

    pointer('pointermove', 15, 15)
    expect(container.style.cursor).toBe('move')
    pointer('pointermove', 10, 10)
    expect(container.style.cursor).toBe('nwse-resize')
    pointer('pointermove', 30, 10)
    expect(container.style.cursor).toBe('nesw-resize')
    pointer('pointermove', 200, 100)
    expect(container.style.cursor).toBe('default')
  })

  it('悬停业务单元上报 hoveredFwId 预览，移出清空', () => {
    const { onPreview } = setup(makeContext())

    pointer('pointermove', 15, 15)
    expect(onPreview).toHaveBeenLastCalledWith({ hoveredFwId: 'box-a' })
    pointer('pointermove', 200, 100)
    expect(onPreview).toHaveBeenLastCalledWith({})
  })

  it('框选中为 crosshair，pointercancel 后复位 default', () => {
    setup()
    pointer('pointerdown', 200, 100)
    pointer('pointermove', 210, 110)
    expect(container.style.cursor).toBe('crosshair')

    pointer('pointercancel', 210, 110)
    expect(container.style.cursor).toBe('default')
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

  it('native 模式经真实场景图拾取选中（dev 双路一致性断言同时通过）', () => {
    const callbacks = makeCallbacks()
    renderer = createLeaferRenderer()
    renderer.mount(container, makeContext([], callbacks, 'native'))

    pointer('pointerdown', 15, 15)

    expect(callbacks.onSelectionRequest).toHaveBeenCalledOnce()
    expect(callbacks.onSelectionRequest).toHaveBeenCalledWith(['box-a'], 'replace')
  })

  it.each(['unified', 'native'] as const)(
    'LOD dot 档（scale<0.2，节点已退化为纯色块）%s 模式仍可点选',
    (interactionMode) => {
      renderer?.destroy()
      const callbacks = makeCallbacks()
      renderer = createLeaferRenderer()
      renderer.mount(container, {
        ...makeContext([], callbacks, interactionMode),
        viewport: { scale: 0.1, offsetX: 0, offsetY: 0 },
      })

      // box-a 画布 (10,10,20,20) → 屏幕 (1,1)-(3,3)
      pointer('pointerdown', 2, 2)

      expect(callbacks.onSelectionRequest).toHaveBeenCalledOnce()
      expect(callbacks.onSelectionRequest).toHaveBeenCalledWith(['box-a'], 'replace')
    },
  )

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

  it('单选时 overlay 画出四角控制点，拖拽 se 角提交一次等比缩放', () => {
    const callbacks = makeCallbacks()
    renderer = createLeaferRenderer()
    renderer.mount(container, makeContext(['box-a'], callbacks))

    // box-a 位于 (10,10,20,20)，se 控制点以角点 (30,30) 为中心
    pointer('pointerdown', 30, 30)
    pointer('pointermove', 50, 50)
    pointer('pointerup', 50, 50)

    expect(callbacks.onNodesResize).toHaveBeenCalledOnce()
    expect(callbacks.onNodesResize).toHaveBeenCalledWith([
      { fwId: 'box-a', parentFwId: 'root', x: 10, y: 10, width: 40, height: 40 },
    ])
  })

  it('多选时 overlay 不提供控制点，角点按下按节点拖拽处理', () => {
    const callbacks = makeCallbacks()
    renderer = createLeaferRenderer()
    renderer.mount(container, makeContext(['box-a', 'box-b'], callbacks))

    pointer('pointerdown', 30, 30)
    pointer('pointermove', 40, 40)
    pointer('pointerup', 40, 40)

    expect(callbacks.onNodesResize).not.toHaveBeenCalled()
    expect(callbacks.onNodesMove).toHaveBeenCalledOnce()
    expect(callbacks.onNodesMove).toHaveBeenCalledWith([
      { fwId: 'box-a', parentFwId: 'root', x: 20, y: 20 },
      { fwId: 'box-b', parentFwId: 'root', x: 50, y: 20 },
    ])
  })

  it('光标仲裁：空格平移（grab）优先于悬停 move，松开恢复', () => {
    renderer = createLeaferRenderer()
    renderer.mount(container, makeContext())

    pointer('pointermove', 15, 15)
    expect(container.style.cursor).toBe('move')

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }))
    expect(container.style.cursor).toBe('grab')
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }))
    expect(container.style.cursor).toBe('move')
  })
})
