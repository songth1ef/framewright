import {
  isDemoImageRequestUrl,
  resolveDemoImageRequestUrl,
  type DemoImageRequestTier,
} from './demo-media'
import {
  isAiImageNode,
  isAiVideoNode,
  isFrameNode,
  isImgNode,
  isVideoNode,
  type CanvasNode,
  type FrameNode,
} from './node-schema'
import { walkTree } from './node-tree'
import type { ViewportSize } from './renderer-adapter'

export interface DemoImageRequestProjection {
  tier: DemoImageRequestTier
  viewportSize: ViewportSize
  devicePixelRatio: number
}

function rewriteNode(node: CanvasNode, projection: DemoImageRequestProjection): CanvasNode {
  if (isFrameNode(node)) {
    let changed = false
    const children = node.children.map((child) => {
      const next = rewriteNode(child, projection)
      if (next !== child) changed = true
      return next
    })
    return changed ? { ...node, children } : node
  }
  const viewportCap = {
    nodeSize: { width: node.width, height: node.height },
    viewportSize: projection.viewportSize,
    devicePixelRatio: projection.devicePixelRatio,
  }
  if (isImgNode(node)) {
    const src = resolveDemoImageRequestUrl(node.src, projection.tier, viewportCap)
    return src === node.src ? node : { ...node, src }
  }
  if (isAiImageNode(node)) {
    if (node.src === null) return node
    const src = resolveDemoImageRequestUrl(node.src, projection.tier, viewportCap)
    return src === node.src ? node : { ...node, src }
  }
  if (isVideoNode(node) || isAiVideoNode(node)) {
    if (node.poster === null) return node
    const poster = resolveDemoImageRequestUrl(node.poster, projection.tier, viewportCap)
    return poster === node.poster ? node : { ...node, poster }
  }
  return node
}

/**
 * 把请求分辨率作为纯展示投影，不写回 Document、撤销栈或自动保存。
 * 两套渲染器因此仍消费同一棵 node 树，不需要知道分档策略。
 */
export function rewriteDemoImageRequests(
  root: FrameNode,
  projection: DemoImageRequestProjection | DemoImageRequestTier,
): FrameNode {
  if (typeof projection === 'number') {
    return rewriteNode(root, {
      tier: projection,
      viewportSize: { width: Number.MAX_VALUE, height: Number.MAX_VALUE },
      devicePixelRatio: 1,
    }) as FrameNode
  }
  return rewriteNode(root, projection) as FrameNode
}

/** 收集当前实际挂载节点使用的 demo 图片 URL，供换档前预加载。 */
export function collectDemoImageRequestUrls(
  root: FrameNode,
  mountedFwIds: ReadonlySet<string>,
): string[] {
  const urls = new Set<string>()
  walkTree(root, (node) => {
    if (!mountedFwIds.has(node.fwId)) return
    if (isImgNode(node) && isDemoImageRequestUrl(node.src)) urls.add(node.src)
    else if (isAiImageNode(node) && node.src !== null && isDemoImageRequestUrl(node.src)) {
      urls.add(node.src)
    } else if (
      (isVideoNode(node) || isAiVideoNode(node)) &&
      node.poster !== null &&
      isDemoImageRequestUrl(node.poster)
    ) {
      urls.add(node.poster)
    }
  })
  return [...urls].sort()
}
