import {
  applySelection,
  collectNodesInRect,
  findNodeById,
  hitTestPoint,
  isFrameNode,
  MIN_NODE_SIZE,
  computeMoves,
  rectFromPoints,
  resizeProportional,
  screenToCanvas,
  type CanvasNode,
  type Corner,
  type FrameNode,
  type Point,
  type NodeMove,
  type Rect,
  type RenderContext,
} from '@framewright/core'

const DRAG_THRESHOLD_CSS_PX = 4

export interface CanvasInteractionPreview {
  marquee?: Rect | null
  moves?: readonly NodeMove[]
  resizes?: readonly NodeResize[]
}

export interface NodeResize extends Rect {
  fwId: string
  parentFwId: string
}

export const EMPTY_INTERACTION_PREVIEW: CanvasInteractionPreview = {}

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
  startCanvas: Point
  fwId: string
  shiftKey: boolean
  wasSelected: boolean
  dragging: boolean
  gestureSelection: readonly string[]
}

interface ResizeGesture {
  kind: 'resize'
  startScreen: Point
  fwId: string
  parentFwId: string
  parentAbsolute: Point
  originalAbsolute: Rect
  corner: Corner
  dragging: boolean
}

type Gesture = BlankGesture | NodeGesture | ResizeGesture

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

function closestResizeHandle(
  target: EventTarget | null,
): { fwId: string; corner: Corner } | null {
  if (!(target instanceof Element)) return null
  const handle = target.closest<HTMLElement>('[data-fw-resize-handle][data-fw-id]')
  const corner = handle?.dataset.fwResizeHandle
  const fwId = handle?.dataset.fwId
  if (fwId === undefined || !['nw', 'ne', 'sw', 'se'].includes(corner ?? '')) return null
  return { fwId, corner: corner as Corner }
}

interface NodeLocation {
  node: CanvasNode
  parent: FrameNode
  absolute: Point
  parentAbsolute: Point
}

function findNodeLocation(root: FrameNode, fwId: string): NodeLocation | null {
  const visit = (parent: FrameNode, parentAbsolute: Point): NodeLocation | null => {
    for (const node of parent.children) {
      const absolute = { x: parentAbsolute.x + node.x, y: parentAbsolute.y + node.y }
      if (node.fwId === fwId) return { node, parent, absolute, parentAbsolute }
      if (isFrameNode(node)) {
        const found = visit(node, absolute)
        if (found !== null) return found
      }
    }
    return null
  }
  return visit(root, { x: root.x, y: root.y })
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

  const resizeAt = (resize: ResizeGesture, screenPoint: Point): NodeResize => {
    const rect = resizeProportional(
      resize.originalAbsolute,
      resize.corner,
      screenToCanvas(ctx.viewport, screenPoint),
      { minSize: MIN_NODE_SIZE },
    )
    return {
      fwId: resize.fwId,
      parentFwId: resize.parentFwId,
      x: rect.x - resize.parentAbsolute.x,
      y: rect.y - resize.parentAbsolute.y,
      width: rect.width,
      height: rect.height,
    }
  }

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
    if (event.button !== 0 || event.defaultPrevented) return

    const startScreen = localScreenPoint(container, event)
    const resizeHandle = closestResizeHandle(event.target)
    if (resizeHandle !== null) {
      if (ctx.selection.length !== 1 || ctx.selection[0] !== resizeHandle.fwId) return
      const location = findNodeLocation(ctx.root, resizeHandle.fwId)
      if (location === null || location.node.locked) return
      event.preventDefault()
      gesture = {
        kind: 'resize',
        startScreen,
        fwId: location.node.fwId,
        parentFwId: location.parent.fwId,
        parentAbsolute: location.parentAbsolute,
        originalAbsolute: {
          x: location.absolute.x,
          y: location.absolute.y,
          width: location.node.width,
          height: location.node.height,
        },
        corner: resizeHandle.corner,
        dragging: false,
      }
      return
    }
    if (shouldIgnore(event.target)) return

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
      startCanvas,
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
    const currentCanvas = screenToCanvas(ctx.viewport, currentScreen)
    if (gesture.kind === 'resize') {
      if (gesture.dragging) options.onPreview({ resizes: [resizeAt(gesture, currentScreen)] })
      return
    }
    if (gesture.kind === 'blank') {
      if (gesture.dragging) {
        options.onPreview({ marquee: rectFromPoints(gesture.startCanvas, currentCanvas) })
      }
      return
    }
    if (gesture.dragging) {
      options.onPreview({
        moves: computeMoves(ctx.root, gesture.gestureSelection, {
          x: currentCanvas.x - gesture.startCanvas.x,
          y: currentCanvas.y - gesture.startCanvas.y,
        }),
      })
    }
  }

  const onPointerUp = (event: PointerEvent): void => {
    if (event.button !== 0 || gesture === null) return
    const finished = gesture
    gesture = null

    if (finished.kind === 'resize') {
      if (finished.dragging) {
        ctx.callbacks.onNodesResize([resizeAt(finished, localScreenPoint(container, event))])
      }
      resetPreview()
      return
    }

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
      return
    }
    if (finished.dragging) {
      const endCanvas = screenToCanvas(ctx.viewport, localScreenPoint(container, event))
      const moves = computeMoves(ctx.root, finished.gestureSelection, {
        x: endCanvas.x - finished.startCanvas.x,
        y: endCanvas.y - finished.startCanvas.y,
      })
      if (moves.length > 0) ctx.callbacks.onNodesMove(moves)
      resetPreview()
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
