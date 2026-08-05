import { isVideoNode } from '@framewright/core'
import type { CSSProperties, ReactNode } from 'react'
import { toNodeStyle } from '../node-style'
import type { ShapeProps } from './registry'

export function VideoShape({ node, position, size, active }: ShapeProps): ReactNode {
  if (!isVideoNode(node)) return null

  const style: CSSProperties = {
    ...toNodeStyle(node, position, size),
    objectFit: node.fit,
    background: '#000000',
    pointerEvents: active ? 'auto' : 'none',
  }

  return (
    <video
      data-fw-id={node.fwId}
      data-fw-type="video"
      data-fw-active={active ? 'true' : undefined}
      data-fw-interaction={active ? 'ignore' : undefined}
      src={node.src}
      poster={node.poster ?? undefined}
      controls
      playsInline
      preload="metadata"
      style={style}
    />
  )
}
