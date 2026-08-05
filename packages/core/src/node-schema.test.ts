import { describe, expect, it } from 'vitest'
import {
  SHAPE_TYPES,
  createAudioNode,
  createAiImageNode,
  createAiVideoNode,
  createBoxNode,
  createFrameNode,
  createImgNode,
  createVideoNode,
  isAiImageNode,
  isAiVideoNode,
  isAudioNode,
  isBoxNode,
  isFrameNode,
  isImgNode,
  isVideoNode,
} from './node-schema'

describe('SHAPE_TYPES', () => {
  it('覆盖全部七种 shape，且顺序固定', () => {
    expect(SHAPE_TYPES).toEqual(['frame', 'box', 'img', 'video', 'audio', 'ai-image', 'ai-video'])
  })
})

describe('createFrameNode', () => {
  it('补齐默认值：位于原点、可见、未锁定、不裁剪、无子节点', () => {
    const frame = createFrameNode({ fwId: 'f1' })
    expect(frame.fwType).toBe('frame')
    expect(frame.x).toBe(0)
    expect(frame.y).toBe(0)
    expect(frame.opacity).toBe(1)
    expect(frame.visible).toBe(true)
    expect(frame.locked).toBe(false)
    expect(frame.clip).toBe(false)
    expect(frame.children).toEqual([])
  })

  it('显式传入的字段覆盖默认值', () => {
    const frame = createFrameNode({ fwId: 'f1', x: 10, width: 800, clip: true })
    expect(frame.x).toBe(10)
    expect(frame.width).toBe(800)
    expect(frame.clip).toBe(true)
  })
})

describe('createBoxNode', () => {
  it('补齐默认值', () => {
    const box = createBoxNode({ fwId: 'b1' })
    expect(box.fwType).toBe('box')
    expect(box.fill).toBe('#CCCCCC')
    expect(box.cornerRadius).toBe(0)
  })
})

describe('createImgNode', () => {
  it('补齐默认值', () => {
    const image = createImgNode({ fwId: 'i1' })
    expect(image).toMatchObject({ fwType: 'img', src: '', fit: 'contain' })
  })
})

describe('createVideoNode', () => {
  it('补齐默认值', () => {
    const video = createVideoNode({ fwId: 'v1' })
    expect(video).toMatchObject({ fwType: 'video', src: '', poster: null, fit: 'contain' })
  })
})

describe('createAudioNode', () => {
  it('补齐默认值', () => {
    const audio = createAudioNode({ fwId: 'a1' })
    expect(audio).toMatchObject({ fwType: 'audio', src: '' })
  })

  it('显式传入的字段覆盖默认值', () => {
    const audio = createAudioNode({ fwId: 'a1', src: 'https://example.com/audio.mp3' })
    expect(audio.src).toBe('https://example.com/audio.mp3')
  })
})

describe('类型守卫', () => {
  it('按 fwType 判别', () => {
    const frame = createFrameNode({ fwId: 'f1' })
    const box = createBoxNode({ fwId: 'b1' })
    const image = createImgNode({ fwId: 'i1' })
    const video = createVideoNode({ fwId: 'v1' })
    const audio = createAudioNode({ fwId: 'a1' })
    expect(isFrameNode(frame)).toBe(true)
    expect(isFrameNode(box)).toBe(false)
    expect(isBoxNode(box)).toBe(true)
    expect(isBoxNode(frame)).toBe(false)
    expect(isImgNode(image)).toBe(true)
    expect(isImgNode(video)).toBe(false)
    expect(isVideoNode(video)).toBe(true)
    expect(isVideoNode(image)).toBe(false)
    expect(isAudioNode(audio)).toBe(true)
    expect(isAudioNode(video)).toBe(false)
  })

  it('七个 fwType 的守卫互斥', () => {
    const aiImage = createAiImageNode({ fwId: 'ai1' })
    const aiVideo = createAiVideoNode({ fwId: 'av1' })
    expect(isAiImageNode(aiImage)).toBe(true)
    expect(isAiImageNode(aiVideo)).toBe(false)
    expect(isAiVideoNode(aiVideo)).toBe(true)
    expect(isAiVideoNode(aiImage)).toBe(false)
    expect(isImgNode(aiImage)).toBe(false)
    expect(isVideoNode(aiVideo)).toBe(false)
    expect(isAudioNode(aiVideo)).toBe(false)
    expect(isBoxNode(aiImage)).toBe(false)
    expect(isFrameNode(aiVideo)).toBe(false)
  })
})

describe('createAiImageNode', () => {
  it('补齐默认值：empty 状态、无来源、无结果', () => {
    const node = createAiImageNode({ fwId: 'ai1' })
    expect(node.fwType).toBe('ai-image')
    expect(node.status).toBe('empty')
    expect(node.generationId).toBeNull()
    expect(node.errorMessage).toBeNull()
    expect(node.prompt).toBe('')
    expect(node.params).toEqual({})
    expect(node.src).toBeNull()
    expect(node.fit).toBe('contain')
    expect(node.sourceFwIds).toEqual([])
  })

  it('显式传入的字段覆盖默认值', () => {
    const node = createAiImageNode({
      fwId: 'ai1',
      status: 'succeeded',
      prompt: 'a cat',
      src: 'https://example.com/cat.png',
      sourceFwIds: ['other'],
    })
    expect(node.status).toBe('succeeded')
    expect(node.prompt).toBe('a cat')
    expect(node.src).toBe('https://example.com/cat.png')
    expect(node.sourceFwIds).toEqual(['other'])
  })
})

describe('createAiVideoNode', () => {
  it('补齐默认值：empty 状态、poster 为 null、无来源', () => {
    const node = createAiVideoNode({ fwId: 'av1' })
    expect(node.fwType).toBe('ai-video')
    expect(node.status).toBe('empty')
    expect(node.src).toBeNull()
    expect(node.poster).toBeNull()
    expect(node.sourceFwIds).toEqual([])
  })

  it('显式传入的字段覆盖默认值', () => {
    const node = createAiVideoNode({ fwId: 'av1', status: 'running', poster: 'p.png' })
    expect(node.status).toBe('running')
    expect(node.poster).toBe('p.png')
  })
})
