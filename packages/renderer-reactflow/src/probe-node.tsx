import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { CSSProperties, ReactNode } from 'react'
import type { ProbeNode } from './mapping'

function mediaStyle(fit: ProbeNode['data']['fit']): CSSProperties {
  return { width: '100%', height: '100%', display: 'block', objectFit: fit ?? 'contain' }
}

function content(id: string, data: ProbeNode['data']): ReactNode {
  if (data.shape === 'video' || data.shape === 'ai-video') {
    if (data.src) {
      return (
        <video
          data-probe-video="true"
          className="nodrag nowheel nopan"
          src={data.src}
          poster={data.poster ?? undefined}
          style={mediaStyle(data.fit)}
          autoPlay
          muted
          loop
          controls
          playsInline
          preload="metadata"
        />
      )
    }
    return data.poster ? <img alt="" src={data.poster} style={mediaStyle(data.fit)} /> : null
  }
  if (data.shape === 'img' || data.shape === 'ai-image') {
    return data.src ? <img alt="" src={data.src} style={mediaStyle(data.fit)} /> : null
  }
  if (data.shape === 'unsupported') {
    return <span>unsupported: {data.unsupportedShape ?? 'unknown'}</span>
  }
  return null
}

/** React Flow 自定义节点：仅承载探针需要的视觉与真实 video。 */
export function ProbeNodeView({ id, data, selected }: NodeProps<ProbeNode>): ReactNode {
  const background = data.fill ?? (data.shape === 'frame' ? 'transparent' : '#94a3b8')
  return (
    <div
      data-fw-id={id}
      data-fw-type={data.shape}
      style={{
        position: 'relative',
        boxSizing: 'border-box',
        width: '100%',
        height: '100%',
        overflow: data.shape === 'frame' ? 'visible' : 'hidden',
        background,
        outline: selected ? '2px solid #2563eb' : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      {content(id, data)}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  )
}
