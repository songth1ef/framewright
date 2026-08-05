import {
  applyOp,
  collectConnectionItems,
  createAiImageNode,
  createBoxNode,
  createFrameNode,
  createMemoryHistory,
  findNodeById,
  type CanvasOp,
  type FrameNode,
} from '@framewright/core'
import { describe, expect, it } from 'vitest'
import { createDerivedGenerationSubmitter } from './derived-actions'

const input = (fwId: string) => ({
  fwId,
  fwType: 'ai-image' as const,
  prompt: `版本 ${fwId}`,
  params: { model: 'mock-image' },
})

/**
 * 镜像 renderer-host 的既有提交通道：commitOps = groupOps + applyOp +
 * history.record（+ setRoot），撤销 = history.undo() 返回的逆 op 再 applyOp。
 * 派生接线必须走这一条路，撤销行为才与其它画布动作一致——本仓踩过
 * 「同一动作两条路径导致撤销行为不一致」的坑。
 */
function makeHarness(root: FrameNode) {
  const history = createMemoryHistory()
  let current = root
  const errors: unknown[] = []
  const submitter = createDerivedGenerationSubmitter({
    getRoot: () => current,
    commitOps: (ops) => {
      // 与 renderer-host 的 groupOps 同款：单个原样、多个包一层 batch
      const op: CanvasOp | null =
        ops.length === 0
          ? null
          : ops.length === 1
            ? ops[0]!
            : { kind: 'batch', ops: ops as Exclude<CanvasOp, { kind: 'batch' }>[] }
      if (op === null) return
      current = applyOp(current, op)
      history.record(op)
    },
    onError: (error) => errors.push(error),
  })
  const undo = (): void => {
    const op = history.undo()
    if (op !== null) current = applyOp(current, op)
  }
  return { submitter, history, errors, undo, getRoot: () => current }
}

const sourceImage = () =>
  createAiImageNode({ fwId: 'source', width: 120, height: 80, status: 'succeeded' })

describe('派生生成接线', () => {
  it('派生后 op 进了 history：撤销一次，新节点与连线一起消失', () => {
    const root = createFrameNode({ fwId: 'root', children: [sourceImage()] })
    const harness = makeHarness(root)

    expect(harness.submitter.submit('source', [input('derived')])).toBe(true)

    const derived = harness.getRoot()
    expect(findNodeById(derived, 'derived')).toMatchObject({
      fwType: 'ai-image',
      status: 'pending',
      sourceFwIds: ['source'],
    })
    expect(collectConnectionItems(derived)).toEqual([
      expect.objectContaining({ fromFwId: 'source', toFwId: 'derived' }),
    ])

    harness.undo()

    expect(harness.getRoot()).toEqual(root)
    expect(collectConnectionItems(harness.getRoot())).toEqual([])
  })

  it('一次派生三个是一个 batch：一次撤销全部回退，源节点保留', () => {
    const root = createFrameNode({ fwId: 'root', children: [sourceImage()] })
    const harness = makeHarness(root)

    expect(
      harness.submitter.submit('source', [input('d-a'), input('d-b'), input('d-c')]),
    ).toBe(true)
    expect(harness.getRoot().children.map((node) => node.fwId)).toEqual([
      'source',
      'd-a',
      'd-b',
      'd-c',
    ])
    expect(collectConnectionItems(harness.getRoot())).toHaveLength(3)

    harness.undo()

    expect(harness.getRoot()).toEqual(root)
    expect(collectConnectionItems(harness.getRoot())).toEqual([])
    // 只撤销了一次，redo 应能把整个 batch 放回来，证明进 history 的是一条记录
    const redoOp = harness.history.redo()
    expect(redoOp?.kind).toBe('batch')
  })

  it('源节点不存在或不是 ai-image 时不提交，history 保持干净', () => {
    const root = createFrameNode({
      fwId: 'root',
      children: [createBoxNode({ fwId: 'box' })],
    })
    const harness = makeHarness(root)

    expect(harness.submitter.submit('ghost', [input('d-1')])).toBe(false)
    expect(harness.submitter.submit('box', [input('d-2')])).toBe(false)
    expect(harness.submitter.submit('root', [])).toBe(false)

    expect(harness.getRoot()).toEqual(root)
    expect(harness.history.undo()).toBeNull()
  })

  it('core 拒绝构造 op（fwId 重复）时报 onError，不进 history', () => {
    const root = createFrameNode({ fwId: 'root', children: [sourceImage()] })
    const harness = makeHarness(root)

    expect(harness.submitter.submit('source', [input('source')])).toBe(false)

    expect(harness.errors).toHaveLength(1)
    expect(harness.getRoot()).toEqual(root)
    expect(harness.history.undo()).toBeNull()
  })
})
