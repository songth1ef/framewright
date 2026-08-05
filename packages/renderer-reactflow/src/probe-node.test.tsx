import { renderToStaticMarkup } from 'react-dom/server'
import { ReactFlowProvider } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import { ProbeNodeView } from './probe-node'

describe('React Flow 探针节点', () => {
  it('video 形状实际产出可播放 video 元素', () => {
    const html = renderToStaticMarkup(
      <ReactFlowProvider><ProbeNodeView
        id="video-1"
        type="probe"
        data={{ shape: 'video', src: '/video.webm', poster: '/poster.webp', fit: 'cover', rotation: 0 }}
        selected={false}
        dragging={false}
        draggable
        selectable
        deletable={false}
        zIndex={0}
        isConnectable={false}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      /></ReactFlowProvider>,
    )
    expect(html).toContain('<video')
    expect(html).toContain('src="/video.webm"')
    expect(html).toContain('autoPlay=""')
    expect(html).toContain('muted=""')
    expect(html).toContain('controls=""')
    expect(html).toContain('data-fw-id="video-1"')
  })

  it('unsupported 形状明确显示原因', () => {
    const html = renderToStaticMarkup(
      <ReactFlowProvider><ProbeNodeView
        id="audio-1"
        type="probe"
        data={{ shape: 'unsupported', unsupportedShape: 'audio', rotation: 0 }}
        selected={false}
        dragging={false}
        draggable={false}
        selectable={false}
        deletable={false}
        zIndex={0}
        isConnectable={false}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      /></ReactFlowProvider>,
    )
    expect(html).toContain('unsupported: audio')
  })
})
