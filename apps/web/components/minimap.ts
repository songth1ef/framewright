import {
  isAiImageNode,
  isFrameNode,
  isImgNode,
  type CanvasNode,
  type FrameNode,
  type ObjectFit,
  type Rect,
  type Viewport,
} from '@framewright/core'
import type { ViewportSize } from './viewport-actions'

export const MINIMAP_WIDTH = 200
export const MINIMAP_HEIGHT = 150
export const MINIMAP_PADDING = 8
/** Chromium 多规模 5 次中位数实测的最高合格档，见 minimap-performance-results.json。 */
export const MINIMAP_THUMBNAIL_DRAW_LIMIT = 2_500
export const MINIMAP_THUMBNAIL_MIN_SIZE = 4

export interface MinimapProjection {
  scale: number
  offsetX: number
  offsetY: number
}

export interface MinimapDrawItem {
  fwId: string
  fwType: CanvasNode['fwType']
  x: number
  y: number
  width: number
  height: number
  opacity: number
  thumbnail?: {
    src: string
    fit: ObjectFit
  }
}

export type MinimapIcon = 'image' | 'video' | 'audio' | null

export interface MinimapVisual {
  color: string
  icon: MinimapIcon
}

const MINIMAP_VISUALS: Record<CanvasNode['fwType'], MinimapVisual> = {
  frame: { color: '#94a3b8', icon: null },
  box: { color: '#64748b', icon: null },
  img: { color: '#2563eb', icon: 'image' },
  video: { color: '#7c3aed', icon: 'video' },
  audio: { color: '#db2777', icon: 'audio' },
  'ai-image': { color: '#0891b2', icon: 'image' },
  'ai-video': { color: '#9333ea', icon: 'video' },
}

export function getMinimapVisual(type: CanvasNode['fwType']): MinimapVisual {
  return MINIMAP_VISUALS[type]
}

export function shouldDrawMinimapIcon(width: number, height: number): boolean {
  return width >= 12 && height >= 12
}

export function hasRenderableMinimapThumbnail(width: number, height: number): boolean {
  return width >= MINIMAP_THUMBNAIL_MIN_SIZE && height >= MINIMAP_THUMBNAIL_MIN_SIZE
}

export function shouldDrawMinimapThumbnail(thumbnailIndex: number): boolean {
  return thumbnailIndex >= 0 && thumbnailIndex < MINIMAP_THUMBNAIL_DRAW_LIMIT
}

type BitmapLoader = (src: string) => Promise<ImageBitmap>

interface BitmapCacheEntry {
  bitmap: ImageBitmap | null
  pending: Promise<ImageBitmap | null>
}

async function loadDownsampledBitmap(src: string): Promise<ImageBitmap> {
  const response = await fetch(src)
  if (!response.ok) throw new Error(`缩略图加载失败：${response.status}`)
  const blob = await response.blob()
  return createImageBitmap(blob, {
    resizeWidth: 64,
    resizeHeight: 64,
    resizeQuality: 'low',
  })
}

/** 由 Minimap host 持有；同源去重，节点移除或组件卸载时 close ImageBitmap。 */
export class MinimapBitmapCache {
  readonly #entries = new Map<string, BitmapCacheEntry>()

  constructor(private readonly loader: BitmapLoader = loadDownsampledBitmap) {}

  get(src: string): Promise<ImageBitmap | null> {
    const existing = this.#entries.get(src)
    if (existing !== undefined) return existing.pending
    const entry: BitmapCacheEntry = { bitmap: null, pending: Promise.resolve(null) }
    entry.pending = this.loader(src)
      .then((bitmap) => {
        if (this.#entries.get(src) === entry) entry.bitmap = bitmap
        return bitmap
      })
      .catch(() => null)
    this.#entries.set(src, entry)
    return entry.pending
  }

  retainOnly(sources: ReadonlySet<string>): void {
    for (const [src, entry] of this.#entries) {
      if (sources.has(src)) continue
      this.#entries.delete(src)
      if (entry.bitmap !== null) entry.bitmap.close()
      else void entry.pending.then((bitmap) => bitmap?.close())
    }
  }

  dispose(): void {
    this.retainOnly(new Set())
  }
}

export interface MinimapViewportFrame {
  left: number
  top: number
  width: number
  height: number
}

interface Point {
  x: number
  y: number
}

export function createMinimapProjection(
  bounds: Rect,
  size: ViewportSize,
  padding: number,
): MinimapProjection {
  const availableWidth = Math.max(1, size.width - padding * 2)
  const availableHeight = Math.max(1, size.height - padding * 2)
  const scale = Math.min(
    bounds.width > 0 ? availableWidth / bounds.width : 1,
    bounds.height > 0 ? availableHeight / bounds.height : 1,
  )
  return {
    scale,
    offsetX: (size.width - bounds.width * scale) / 2 - bounds.x * scale,
    offsetY: (size.height - bounds.height * scale) / 2 - bounds.y * scale,
  }
}

export function mapMinimapPointToCanvas(
  point: Point,
  projection: MinimapProjection,
): Point {
  return {
    x: (point.x - projection.offsetX) / projection.scale,
    y: (point.y - projection.offsetY) / projection.scale,
  }
}

export function viewportCenteredAt(
  canvasPoint: Point,
  viewport: Viewport,
  viewportSize: ViewportSize,
): Viewport {
  return {
    scale: viewport.scale,
    offsetX: viewportSize.width / 2 - canvasPoint.x * viewport.scale,
    offsetY: viewportSize.height / 2 - canvasPoint.y * viewport.scale,
  }
}

export function projectViewportFrame(
  viewport: Viewport,
  viewportSize: ViewportSize,
  projection: MinimapProjection,
): MinimapViewportFrame {
  const canvasLeft = -viewport.offsetX / viewport.scale
  const canvasTop = -viewport.offsetY / viewport.scale
  return {
    left: canvasLeft * projection.scale + projection.offsetX,
    top: canvasTop * projection.scale + projection.offsetY,
    width: (viewportSize.width / viewport.scale) * projection.scale,
    height: (viewportSize.height / viewport.scale) * projection.scale,
  }
}

/** 节点树变化时才执行；保留真实尺寸与 z 序，但不产生逐节点 UI。 */
export function createMinimapDrawItems(root: FrameNode): MinimapDrawItem[] {
  const items: MinimapDrawItem[] = []
  const visitChildren = (frame: FrameNode, parentX: number, parentY: number): void => {
    for (const node of frame.children) {
      if (!node.visible) continue
      const x = parentX + node.x
      const y = parentY + node.y
      items.push({
        fwId: node.fwId,
        fwType: node.fwType,
        x,
        y,
        width: node.width,
        height: node.height,
        opacity: node.opacity,
        ...((isImgNode(node) || isAiImageNode(node)) && node.src !== null && node.src !== ''
          ? { thumbnail: { src: node.src, fit: node.fit } }
          : {}),
      })
      if (isFrameNode(node)) visitChildren(node, x, y)
    }
  }

  visitChildren(root, root.x, root.y)
  return items
}
