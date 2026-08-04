import {
  normalizeWheelSteps,
  panBy,
  zoomAtPoint,
  type RendererCallbacks,
  type Viewport,
} from '@framewright/core'

const SCALE_LIMITS = { min: 0.1, max: 4 } as const
const ZOOM_STEP = 1.1

interface ViewportInteractionOptions {
  onViewportChange: RendererCallbacks['onViewportChange']
  onPreview(viewport: Viewport): void
  onCursorChange?(cursor: 'grab' | 'grabbing' | null): void
}

export interface ViewportInteraction {
  update(viewport: Viewport, onViewportChange: RendererCallbacks['onViewportChange']): void
  destroy(): void
}

function viewportEquals(a: Viewport, b: Viewport): boolean {
  return a.scale === b.scale && a.offsetX === b.offsetX && a.offsetY === b.offsetY
}

function isSpaceEvent(event: KeyboardEvent): boolean {
  return event.code === 'Space' || event.key === ' '
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
}

/**
 * 视口手势状态机（docs/interaction-spec.md §1）：
 * 滚轮 = 垂直平移；Shift+滚轮 = 水平平移；Ctrl/Cmd+滚轮 = 光标锚点缩放（×1.1 步进，
 * 钳制 10%–400%）；中键拖拽 / 空格+左键拖拽 = 1:1 平移。
 *
 * 本文件与 renderer-dom/src/viewport-interaction.ts 是**两侧各写一份的孪生实现**：
 * 它只操作 container 原生 DOM 事件，不碰任何 Leafer API（Leafer 不上抛 wheel，
 * 且契约要求把 Leafer 当感知器用，见 docs/renderer-contract.md §3）。
 * 两侧必须保持逐行对齐——同一手势两边行为分歧会直接污染选型对照结论。
 * 几何计算全部走 core（panBy / zoomAtPoint / normalizeWheelSteps），此处不自己算。
 *
 * `data-fw-interaction="ignore"` 分支当前在 Leafer 侧不会命中（内部按钮是 canvas
 * 自绘，事件 target 不会带该属性），保留它只为与 DOM 版对齐——将来若叠 DOM 覆盖层
 * （如视频播放器），这个分支就该生效。
 */
export function createViewportInteraction(
  container: HTMLElement,
  initialViewport: Viewport,
  options: ViewportInteractionOptions,
): ViewportInteraction {
  let draftViewport = initialViewport
  let onViewportChange = options.onViewportChange
  let pendingViewport: Viewport | null = null
  let frameId: number | null = null
  let spacePressed = false
  let panPointer: { button: number; x: number; y: number } | null = null
  const previousCursor = container.style.cursor

  const emitPending = (): void => {
    if (frameId !== null) {
      cancelAnimationFrame(frameId)
      frameId = null
    }
    if (pendingViewport === null) return
    const viewport = pendingViewport
    pendingViewport = null
    onViewportChange(viewport)
  }

  const scheduleViewport = (viewport: Viewport): void => {
    if (viewportEquals(viewport, draftViewport)) return
    draftViewport = viewport
    pendingViewport = viewport
    options.onPreview(viewport)
    if (frameId !== null) return
    frameId = requestAnimationFrame(() => {
      frameId = null
      if (pendingViewport === null) return
      const next = pendingViewport
      pendingViewport = null
      onViewportChange(next)
    })
  }

  const updateCursor = (): void => {
    const cursor = panPointer !== null ? 'grabbing' : spacePressed ? 'grab' : null
    if (options.onCursorChange !== undefined) {
      options.onCursorChange(cursor)
    } else {
      container.style.cursor = cursor ?? previousCursor
    }
  }

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) {
      const rect = container.getBoundingClientRect()
      const steps = normalizeWheelSteps(event.deltaY, event.deltaMode)
      scheduleViewport(
        zoomAtPoint(
          draftViewport,
          { x: event.clientX - rect.left, y: event.clientY - rect.top },
          ZOOM_STEP ** -steps,
          SCALE_LIMITS,
        ),
      )
      return
    }

    if (event.shiftKey) {
      const horizontalDelta = event.deltaX === 0 ? event.deltaY : event.deltaX
      scheduleViewport(panBy(draftViewport, -horizontalDelta, 0))
      return
    }
    scheduleViewport(panBy(draftViewport, -event.deltaX, -event.deltaY))
  }

  const onPointerDown = (event: PointerEvent): void => {
    const middlePan = event.button === 1
    const spacePan = event.button === 0 && spacePressed
    if (!middlePan && !spacePan) return
    if (
      spacePan &&
      event.target instanceof Element &&
      event.target.closest('[data-fw-interaction="ignore"]') !== null
    ) {
      return
    }
    event.preventDefault()
    panPointer = { button: event.button, x: event.clientX, y: event.clientY }
    updateCursor()
  }

  const applyPointerPosition = (event: PointerEvent): void => {
    if (panPointer === null) return
    const deltaX = event.clientX - panPointer.x
    const deltaY = event.clientY - panPointer.y
    if (deltaX === 0 && deltaY === 0) return
    panPointer = { ...panPointer, x: event.clientX, y: event.clientY }
    scheduleViewport(panBy(draftViewport, deltaX, deltaY))
  }

  const onPointerMove = (event: PointerEvent): void => applyPointerPosition(event)

  const finishPointer = (event: PointerEvent): void => {
    if (panPointer === null || event.button !== panPointer.button) return
    applyPointerPosition(event)
    panPointer = null
    updateCursor()
    emitPending()
  }

  const cancelPointer = (): void => {
    if (panPointer === null) return
    panPointer = null
    updateCursor()
    emitPending()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!isSpaceEvent(event) || isEditableTarget(event.target)) return
    event.preventDefault()
    if (spacePressed) return
    spacePressed = true
    updateCursor()
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (!isSpaceEvent(event)) return
    spacePressed = false
    updateCursor()
  }

  const preventMiddleDefault = (event: MouseEvent): void => {
    if (event.button === 1) event.preventDefault()
  }

  const onBlur = (): void => {
    spacePressed = false
    cancelPointer()
    updateCursor()
  }

  container.addEventListener('wheel', onWheel, { passive: false })
  container.addEventListener('pointerdown', onPointerDown)
  container.addEventListener('mousedown', preventMiddleDefault)
  container.addEventListener('auxclick', preventMiddleDefault)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', finishPointer)
  window.addEventListener('pointercancel', cancelPointer)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)

  return {
    update(viewport, nextOnViewportChange) {
      onViewportChange = nextOnViewportChange
      // 🔴 回流幂等（renderer-contract §2.1）：host 把刚上报的 viewport 回灌进来时
      // 必须相等性短路，否则抖动回环
      if (viewportEquals(viewport, draftViewport)) return
      if (frameId !== null) cancelAnimationFrame(frameId)
      frameId = null
      pendingViewport = null
      draftViewport = viewport
      options.onPreview(viewport)
    },

    destroy() {
      emitPending()
      container.removeEventListener('wheel', onWheel)
      container.removeEventListener('pointerdown', onPointerDown)
      container.removeEventListener('mousedown', preventMiddleDefault)
      container.removeEventListener('auxclick', preventMiddleDefault)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', finishPointer)
      window.removeEventListener('pointercancel', cancelPointer)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      if (options.onCursorChange !== undefined) options.onCursorChange(null)
      else container.style.cursor = previousCursor
    },
  }
}
