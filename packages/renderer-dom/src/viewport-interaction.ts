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
    container.style.cursor = panPointer !== null ? 'grabbing' : spacePressed ? 'grab' : previousCursor
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
      container.style.cursor = previousCursor
    },
  }
}
