import type { ViewportSize } from '@framewright/core'

function measureViewportSize(element: HTMLElement): ViewportSize {
  return { width: element.clientWidth, height: element.clientHeight }
}

function isSameSize(left: ViewportSize, right: ViewportSize): boolean {
  return left.width === right.width && left.height === right.height
}

/** 立即发布初始尺寸，并把 ResizeObserver 的连续通知合并到每帧至多一次。 */
export function observeViewportSize(
  element: HTMLElement,
  onSize: (size: ViewportSize) => void,
): () => void {
  let lastSize = measureViewportSize(element)
  let frameId: number | null = null
  onSize(lastSize)

  const observer = new ResizeObserver(() => {
    if (frameId !== null) return
    frameId = requestAnimationFrame(() => {
      frameId = null
      const nextSize = measureViewportSize(element)
      if (isSameSize(lastSize, nextSize)) return
      lastSize = nextSize
      onSize(nextSize)
    })
  })
  observer.observe(element)

  return () => {
    observer.disconnect()
    if (frameId !== null) cancelAnimationFrame(frameId)
  }
}
