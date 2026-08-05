import { describe, expect, it } from 'vitest'
import { collectConnectionItems } from './connections'
import {
  createDerivedGenerationBatchOp,
  createDerivedGenerationOp,
} from './derived-generation'
import { applyOp, invertOp } from './history'
import { createAiImageNode, createBoxNode, createFrameNode } from './node-schema'

const request = (fwId: string) => ({
  fwId,
  fwType: 'ai-image' as const,
  generationId: `generation-${fwId}`,
  prompt: `版本 ${fwId}`,
  params: { model: 'mock-image', seed: fwId },
})

describe('派生生成', () => {
  it('在源节点右侧向下避让，并构造带溯源关系的 pending 节点', () => {
    const source = createAiImageNode({
      fwId: 'source',
      x: 10,
      y: 20,
      width: 120,
      height: 80,
      status: 'succeeded',
      src: '/source.png',
    })
    const root = createFrameNode({
      fwId: 'root',
      children: [
        source,
        createBoxNode({ fwId: 'blocker', x: 154, y: 20, width: 120, height: 80 }),
      ],
    })

    const op = createDerivedGenerationOp(root, source, request('derived'))

    expect(op).toMatchObject({
      kind: 'add-node',
      slot: { parentFwId: 'root', index: 2, x: 154, y: 124 },
      inboundRefs: [],
      node: {
        fwId: 'derived',
        fwType: 'ai-image',
        generationId: 'generation-derived',
        status: 'pending',
        prompt: '版本 derived',
        params: { model: 'mock-image', seed: 'derived' },
        sourceFwIds: ['source'],
        width: 120,
        height: 80,
      },
    })
  })

  it('派生后撤销，新节点与由 sourceFwIds 产生的连线一起消失', () => {
    const source = createAiImageNode({ fwId: 'source', width: 120, height: 80 })
    const root = createFrameNode({ fwId: 'root', children: [source] })
    const op = createDerivedGenerationOp(root, source, request('derived'))

    const derived = applyOp(root, op)
    expect(collectConnectionItems(derived)).toEqual([
      expect.objectContaining({ fromFwId: 'source', toFwId: 'derived' }),
    ])

    const undone = applyOp(derived, invertOp(op))
    expect(undone).toEqual(root)
    expect(collectConnectionItems(undone)).toEqual([])
  })

  it('一次派生三个结果表达为一个 batch，一次撤销全部回退', () => {
    const source = createAiImageNode({
      fwId: 'source',
      x: 10,
      y: 20,
      width: 120,
      height: 80,
    })
    const root = createFrameNode({ fwId: 'root', children: [source] })
    const op = createDerivedGenerationBatchOp(root, source, [
      request('derived-a'),
      request('derived-b'),
      request('derived-c'),
    ])

    expect(op.kind).toBe('batch')
    expect(op.ops).toHaveLength(3)

    const derived = applyOp(root, op)
    expect(derived.children.map((node) => node.fwId)).toEqual([
      'source',
      'derived-a',
      'derived-b',
      'derived-c',
    ])
    expect(collectConnectionItems(derived)).toHaveLength(3)

    const undone = applyOp(derived, invertOp(op))
    expect(undone).toEqual(root)
    expect(collectConnectionItems(undone)).toEqual([])
  })
})
