import { isImgNode } from '@framewright/core'
import type { CSSProperties, ReactNode } from 'react'
import { toNodeStyle } from '../node-style'
import type { ShapeProps } from './registry'

export function ImageShape({ node, position, size }: ShapeProps): ReactNode {
  if (!isImgNode(node)) return null

  const base = toNodeStyle(node, position, size)
  if (node.src === '') {
    const placeholderStyle: CSSProperties = {
      ...base,
      background: 'repeating-linear-gradient(45deg,#EEE,#EEE 8px,#DDD 8px,#DDD 16px)',
      border: '1px dashed #999',
    }
    return (
      <div
        data-fw-id={node.fwId}
        data-fw-type="img"
        data-fw-image-placeholder="true"
        style={placeholderStyle}
      />
    )
  }

  const style: CSSProperties = {
    ...base,
    objectFit: node.fit,
  }
  return (
    <img
      data-fw-id={node.fwId}
      data-fw-type="img"
      src={node.src}
      alt=""
      draggable={false}
      style={style}
    />
  )
}
