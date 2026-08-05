import type { VideoElementLike } from '../../src/video/video-source'

type ProbeVideoElement = HTMLVideoElement & VideoElementLike
type ProbeVideoElementCreator = () => ProbeVideoElement

/** 探针专用：必须先设置 CORS 模式，再赋 src，才能保持 canvas 可读。 */
export function createAnonymousProbeVideoElement(
  url: string,
  createElement: ProbeVideoElementCreator = () => document.createElement('video'),
): ProbeVideoElement {
  const element = createElement()
  element.crossOrigin = 'anonymous'
  element.preload = 'auto'
  element.playsInline = true
  element.src = url
  return element
}
