import {
  collectDemoImageRequestUrls,
  getNodesInViewport,
  rewriteDemoImageRequests,
  type DemoImageRequestProjection,
  type FrameNode,
  type Viewport,
  type ViewportCullingLimits,
  type ViewportSize,
} from '@framewright/core'

export type DemoImagePreloader = (
  urls: readonly string[],
) => Promise<readonly HTMLImageElement[]>

/** 只有所有新图都成功解码才 resolve；任一失败时调用方继续展示旧档。 */
export async function preloadDemoImages(
  urls: readonly string[],
): Promise<readonly HTMLImageElement[]> {
  return Promise.all(urls.map(async (url) => {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    await image.decode()
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      throw new Error(`demo 图片解码尺寸无效：${url}`)
    }
    return image
  }))
}

export interface PrepareDemoImageRequestTierOptions {
  root: FrameNode
  projection: DemoImageRequestProjection
  viewport: Viewport
  viewportSize: ViewportSize
  cullingLimits: ViewportCullingLimits
  preload?: DemoImagePreloader
}

/**
 * 先算出目标展示树，但在当前实际挂载的图片全部预加载完成前绝不把它交给 host。
 * 由 host 一次 setState 原子换档，因此加载期间旧图始终留在两套渲染器里。
 */
export async function prepareDemoImageRequestTier(
  options: PrepareDemoImageRequestTierOptions,
): Promise<{
  root: FrameNode
  preloadedImages: readonly HTMLImageElement[]
}> {
  const root = rewriteDemoImageRequests(options.root, options.projection)
  const mountedFwIds = getNodesInViewport(root, options.viewport, {
    width: options.viewportSize.width,
    height: options.viewportSize.height,
    maxNodes: options.cullingLimits.maxNodes,
    maxConnections: options.cullingLimits.maxConnections,
  })
  const urls = collectDemoImageRequestUrls(root, mountedFwIds)
  const preloadedImages = await (options.preload ?? preloadDemoImages)(urls)
  return { root, preloadedImages }
}
