import { isVideoNode } from '@framewright/core'
import type { CSSProperties, ReactNode } from 'react'
import { toNodeStyle } from '../node-style'
import type { ShapeProps } from './registry'

export function VideoShape({ node, position, size, active }: ShapeProps): ReactNode {
  if (!isVideoNode(node)) return null

  const base = toNodeStyle(node, position, size)

  // 🔴 空 src 绝不能透传给 <video>。
  //
  // `src` 的 schema 默认值是空字符串而不是 null，早期存下来的文档里 `src: ''` 到处都是。
  // 把它原样交给 `<video>` 的后果，浏览器自己的警告说得很清楚：
  //   「An empty string ("") was passed to the src attribute. This may cause the
  //     browser to download the whole page again over the network.」
  // Leafer 侧同一条数据则抛 `NotSupportedError: The element has no supported sources`。
  //
  // 口径与 ImageShape 的空态占位保持一致。
  if (node.src === '') {
    return (
      <div
        data-fw-id={node.fwId}
        data-fw-type="video"
        data-fw-video-placeholder="true"
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
