import {
  applySelection,
  collectNodesInRect,
  findNodeById,
  hitTestPoint,
  isFrameNode,
  rectFromPoints,
  screenToCanvas,
  type Point,
  type Rect,
  type RenderContext,
} from '@framewright/core'

const DRAG_THRESHOLD_CSS_PX = 4

export interface CanvasInteractionPreview {
  marquee: Rect | null
}

export const EMPTY_INTERACTION_PREVIEW: CanvasInteractionPreview = { marquee: null }

interface CanvasInteractionOptions {
  onPreview(preview: CanvasInteractionPreview): void
}

export interface CanvasInteraction {
  update(ctx: RenderContext): void
  destroy(): void
}

interface BlankGesture {
  kind: 'blank'
  startScreen: Point
  startCanvas: Point
  shiftKey: boolean
  dragging: boolean
}

interface NodeGesture {
  kind: 'node'
  startScreen: Point
  fwId: string
  shiftKey: boolean
  wasSelected: boolean
  dragging: boolean
  gestureSelection: readonly string[]
}

type Gesture = BlankGesture | NodeGesture

function localScreenPoint(container: HTMLElement, event: MouseEvent): Point {
  const bounds = container.getBoundingClientRect()
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

function exceededThreshold(start: Point, current: Point): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) > DRAG_THRESHOLD_CSS_PX
}

function closestFwId(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  return target.closest<HTMLElement>('[data-fw-id]')?.dataset.fwId ?? null
}

function shouldIgnore(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest('[data-fw-interaction="ignore"]') !== null
  )
}

/** DOM 事件只负责感知；命中、选区与集合语义全部委托给 core。 */
export function createCanvasInteraction(
  container: HTMLElement,
  initialContext: RenderContext,
  options: CanvasInteractionOptions,
): CanvasInteraction {
  let ctx = initialContext
  let gesture: Gesture | null = null

  const resetPreview = (): void => options.onPreview(EMPTY_INTERACTION_PREVIEW)

  const selectableHit = (event: MouseEvent, canvasPoint: Point): string | null => {
    const targetId = closestFwId(event.target)
    if (targetId === ctx.root.fwId) return null
    if (targetId !== null && findNodeById(ctx.root, targetId)?.locked) return null

    const hit = hitTestPoint(ctx.root, canvasPoint)
    if (hit === null) return null
    const node = findNodeById(ctx.root, hit)
    return node !== null && isFrameNode(node) && node.background === null ? null : hit
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || event.defaultPrevented || shouldIgnore(event.target)) return

    const startScreen = localScreenPoint(container, event)
    const startCanvas = screenToCanvas(ctx.viewport, startScreen)
    const hit = selectableHit(event, startCanvas)
    if (hit === null) {
      gesture = {
        kind: 'blank',
        startScreen,
        startCanvas,
        shiftKey: event.shiftKey,
        dragging: false,
      }
      return
    }

    const wasSelected = ctx.selection.includes(hit)
    let gestureSelection = ctx.selection
    if (!wasSelected) {
      const mode = event.shiftKey ? 'toggle' : 'replace'
      ctx.callbacks.onSelectionRequest([hit], mode)
      gestureSelection = applySelection(ctx.selection, [hit], mode)
    }
    gesture = {
      kind: 'node',
      startScreen,
      fwId: hit,
      shiftKey: event.shiftKey,
      wasSelected,
      dragging: false,
      gestureSelection,
    }
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (gesture === null) return
    const currentScreen = localScreenPoint(container, event)
    if (!gesture.dragging && exceededThreshold(gesture.startScreen, currentScreen)) {
      gesture.dragging = true
    }
    if (gesture.kind !== 'blank' || !gesture.dragging) return

    const currentCanvas = screenToCanvas(ctx.viewport, currentScreen)
    options.onPreview({ marquee: rectFromPoints(gesture.startCanvas, currentCanvas) })
  }

  const onPointerUp = (event: PointerEvent): void => {
    if (event.button !== 0 || gesture === null) return
    const finished = gesture
    gesture = null

    if (finished.kind === 'blank') {
      if (finished.dragging) {
        const endCanvas = screenToCanvas(ctx.viewport, localScreenPoint(container, event))
        const ids = collectNodesInRect(ctx.root, rectFromPoints(finished.startCanvas, endCanvas))
        ctx.callbacks.onSelectionRequest(ids, finished.shiftKey ? 'add' : 'replace')
      } else if (!finished.shiftKey) {
        ctx.callbacks.onSelectionRequest([], 'replace')
      }
      resetPreview()
      return
    }

    if (!finished.dragging && finished.shiftKey && finished.wasSelected) {
      ctx.callbacks.onSelectionRequest([finished.fwId], 'toggle')
    }
  }

  const cancelGesture = (): void => {
    if (gesture === null) return
    gesture = null
    resetPreview()
  }

  container.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', cancelGesture)
  window.addEventListener('blur', cancelGesture)

  return {
    update(nextContext) {
      ctx = nextContext
    },

    destroy() {
      cancelGesture()
      container.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', cancelGesture)
      window.removeEventListener('blur', cancelGesture)
    },
  }
}
