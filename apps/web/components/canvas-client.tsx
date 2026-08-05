'use client'

import type { FrameNode } from '@framewright/core'
import dynamic from 'next/dynamic'

// LeaferJS 依赖真实 canvas，画布宿主只在浏览器中挂载。
const RendererHost = dynamic(
  () => import('./renderer-host').then((module) => module.RendererHost),
  { ssr: false },
)

export function CanvasClient({
  documentId,
  documentName,
  initialRoot,
}: {
  documentId?: string
  documentName?: string
  initialRoot?: FrameNode
}) {
  return (
    <RendererHost documentId={documentId} documentName={documentName} initialRoot={initialRoot} />
  )
}
