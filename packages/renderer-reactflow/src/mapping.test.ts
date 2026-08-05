import { createAiImageNode, createAudioNode, createFrameNode, createVideoNode } from '@framewright/core'
import { describe, expect, it } from 'vitest'
import { mapFrameToReactFlow } from './mapping'

describe('core node → React Flow 映射', () => {
  it('逐字段映射节点并保留父子绝对坐标、选中与锁定语义', () => {
    const root = createFrameNode({
      fwId: 'root',
      x: 10,
      y: 20,
      width: 800,
      height: 600,
      children: [
        createVideoNode({
          fwId: 'video-1',
          x: 30,
          y: 40,
          width: 320,
          height: 180,
          locked: true,
          src: '/video.webm',
          poster: '/poster.webp',
          fit: 'cover',
        }),
      ],
    })

    const mapped = mapFrameToReactFlow(root, ['video-1'])
    expect(mapped.nodes[0]).toMatchObject({
      id: 'video-1',
      position: { x: 40, y: 60 },
      width: 320,
      height: 180,
      selected: true,
      draggable: false,
      data: {
        shape: 'video',
        src: '/video.webm',
        poster: '/poster.webp',
        fit: 'cover',
      },
    })
  })

  it('映射 sourceFwIds 为只读边，不生成连接交互句柄语义', () => {
    const root = createFrameNode({
      fwId: 'root',
      children: [
        createVideoNode({ fwId: 'source', x: 0, y: 0 }),
        createAiImageNode({ fwId: 'result', x: 200, y: 0, sourceFwIds: ['source'] }),
      ],
    })
    const mapped = mapFrameToReactFlow(root, [])
    expect(mapped.edges).toEqual([
      expect.objectContaining({ id: 'source->result:0', source: 'source', target: 'result' }),
    ])
    expect(mapped.nodes.every((node) => node.connectable === false)).toBe(true)
  })

  it('不把 core node 整体泄漏到 React Flow node/data/style', () => {
    const node = createVideoNode({ fwId: 'video-1', locked: true, src: '/video.webm' })
    const root = createFrameNode({ fwId: 'root', children: [node] })
    const mapped = mapFrameToReactFlow(root, []).nodes[0]!
    const serialized = JSON.stringify({ data: mapped.data, style: mapped.style })
    for (const forbidden of ['fwId', 'fwType', 'locked', 'children']) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  it('audio 保持显式 unsupported，而不是静默漏掉', () => {
    const root = createFrameNode({
      fwId: 'root',
      children: [createAudioNode({ fwId: 'audio-1', src: '/audio.mp3' })],
    })
    expect(mapFrameToReactFlow(root, []).nodes[0]).toMatchObject({
      id: 'audio-1',
      data: { shape: 'unsupported', unsupportedShape: 'audio' },
    })
  })
})
