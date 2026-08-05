import { isAudioNode } from '@framewright/core'
import type { CSSProperties, ReactNode } from 'react'
import { toNodeStyle } from '../node-style'
import type { ShapeProps } from './registry'

export function AudioShape({ node, position, size }: ShapeProps): ReactNode {
  if (!isAudioNode(node)) return null

  const base = toNodeStyle(node, position, size)
  if (node.src === '') {
    return (
      <div
        data-fw-id={node.fwId}
        data-fw-type="audio"
        data-fw-audio-placeholder="true"
        style={{
          ...base,
          background: 'repeating-linear-gradient(45deg,#EEE,#EEE 8px,#DDD 8px,#DDD 16px)',
          border: '1px dashed #999',
        }}
      />
    )
  }

  const style: CSSProperties = {
    ...base,
    background: '#171A21',
    borderRadius: '8px',
    overflow: 'hidden',
  }

  return (
    <div
      data-fw-id={node.fwId}
      data-fw-type="audio"
      data-fw-audio-card="true"
      data-fw-audio-name={node.name || '音频'}
      style={style}
    >
      <audio
        data-fw-audio-controls="true"
        data-fw-interaction="ignore"
        src={node.src}
        controls
        preload="none"
      />
    </div>
  )
}
