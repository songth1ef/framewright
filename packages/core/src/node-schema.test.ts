import { describe, expect, it } from 'vitest'
import {
  SHAPE_TYPES,
  createBoxNode,
  createFrameNode,
  createImgNode,
  createVideoNode,
  isBoxNode,
  isFrameNode,
  isImgNode,
  isVideoNode,
} from './node-schema'

describe('SHAPE_TYPES', () => {
  it('是 frame/box/img/video 四个，且顺序固定', () => {
    expect(SHAPE_TYPES).toEqual(['frame', 'box', 'img', 'video'])
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

describe('类型守卫', () => {
  it('按 fwType 判别', () => {
    const frame = createFrameNode({ fwId: 'f1' })
    const box = createBoxNode({ fwId: 'b1' })
    const image = createImgNode({ fwId: 'i1' })
    const video = createVideoNode({ fwId: 'v1' })
    expect(isFrameNode(frame)).toBe(true)
    expect(isFrameNode(box)).toBe(false)
    expect(isBoxNode(box)).toBe(true)
    expect(isBoxNode(frame)).toBe(false)
    expect(isImgNode(image)).toBe(true)
    expect(isImgNode(video)).toBe(false)
    expect(isVideoNode(video)).toBe(true)
    expect(isVideoNode(image)).toBe(false)
  })
})
