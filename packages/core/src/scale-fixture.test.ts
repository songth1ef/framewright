import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import { createScaleFixture, type ScaleFixtureNodeType } from './scale-fixture'
import type { AiImageNode, AiVideoNode, CanvasNode } from './node-schema'

type GeneratedNode = AiImageNode | AiVideoNode

function generatedNodes(nodes: readonly CanvasNode[]): GeneratedNode[] {
  return nodes.filter(
    (node): node is GeneratedNode => node.fwType === 'ai-image' || node.fwType === 'ai-video',
  )
}

function edgeCount(nodes: readonly CanvasNode[]): number {
  return generatedNodes(nodes).reduce((total, node) => total + node.sourceFwIds.length, 0)
}

describe('createScaleFixture', () => {
  it('同一组入参和 seed 生成深度相等的树，不依赖 Math.random', () => {
    const options = {
      nodeCount: 120,
      connectionPattern: 'many-to-many' as const,
      seed: 20260805,
    }
    const first = createScaleFixture(options)
    const second = createScaleFixture(options)

    expect(second).toEqual(first)
    expect(createScaleFixture({ ...options, seed: 20260806 })).not.toEqual(first)
  })

  it('nodeCount 表示画布内素材节点数，root frame 是额外的容器节点', () => {
    const root = createScaleFixture({ nodeCount: 10_000, connectionPattern: 'none', seed: 1 })

    expect(root.children).toHaveLength(10_000)
    expect(root.fwType).toBe('frame')
  })

  it('none 无连线；fanin 恰有 nodeCount - 1 条扇入边', () => {
    const none = createScaleFixture({ nodeCount: 40, connectionPattern: 'none', seed: 2 })
    const fanin = createScaleFixture({ nodeCount: 40, connectionPattern: 'fanin', seed: 2 })

    expect(edgeCount(none.children)).toBe(0)
    expect(edgeCount(fanin.children)).toBe(39)
    const target = generatedNodes(fanin.children).find((node) => node.sourceFwIds.length > 0)
    expect(target?.fwId).toBe('scale-node-39')
  })

  it('distributed 把每个非首位生成节点接到紧邻前驱，边数与可接目标数一致', () => {
    const root = createScaleFixture({ nodeCount: 100, connectionPattern: 'distributed', seed: 3 })
    const expectedTargets = root.children.filter(
      (node, index) => index > 0 && (node.fwType === 'ai-image' || node.fwType === 'ai-video'),
    )

    expect(edgeCount(root.children)).toBe(expectedTargets.length)
    for (const target of expectedTargets) {
      const index = root.children.indexOf(target)
      expect((target as GeneratedNode).sourceFwIds).toEqual([`scale-node-${index - 1}`])
    }
  })

  it('many-to-many 是重复的三层 DAG：M 个素材 → K 个 v1 → K 个 v2', () => {
    const root = createScaleFixture({
      nodeCount: 18,
      connectionPattern: 'many-to-many',
      seed: 4,
      manyToMany: { sourceCount: 5, productCount: 2 },
    })
    const [s0, s1, s2, s3, s4, v1a, v1b, v2a, v2b] = root.children
    const sourceIds = [s0, s1, s2, s3, s4].map((node) => node?.fwId)

    expect((v1a as GeneratedNode).sourceFwIds).toEqual(sourceIds)
    expect((v1b as GeneratedNode).sourceFwIds).toEqual(sourceIds)
    expect((v2a as GeneratedNode).sourceFwIds).toEqual([v1a?.fwId, v1b?.fwId, s0?.fwId])
    expect((v2b as GeneratedNode).sourceFwIds).toEqual([v1a?.fwId, v1b?.fwId, s1?.fwId])
    expect(edgeCount(root.children)).toBe(32)

    const indexById = new Map(root.children.map((node, index) => [node.fwId, index]))
    for (const target of generatedNodes(root.children)) {
      for (const sourceFwId of target.sourceFwIds) {
        expect(indexById.get(sourceFwId)).toBeLessThan(indexById.get(target.fwId)!)
      }
    }
  })

  it('按配置比例混合四种素材类型', () => {
    const typeRatios: Record<ScaleFixtureNodeType, number> = {
      img: 1,
      video: 2,
      'ai-image': 3,
      'ai-video': 4,
    }
    const root = createScaleFixture({
      nodeCount: 1_000,
      connectionPattern: 'none',
      seed: 5,
      typeRatios,
    })
    const counts = Object.fromEntries(
      Object.keys(typeRatios).map((type) => [
        type,
        root.children.filter((node) => node.fwType === type).length,
      ]),
    )

    expect(counts).toEqual({ img: 100, video: 200, 'ai-image': 300, 'ai-video': 400 })
  })

  it('网格布局中任意节点都不重叠', () => {
    const root = createScaleFixture({ nodeCount: 10_000, connectionPattern: 'none', seed: 6 })
    const rows = new Map<number, CanvasNode[]>()

    for (const node of root.children) {
      const row = rows.get(node.y) ?? []
      row.push(node)
      rows.set(node.y, row)
    }
    const sortedRows = [...rows.entries()].sort(([leftY], [rightY]) => leftY - rightY)
    for (let rowIndex = 0; rowIndex < sortedRows.length; rowIndex += 1) {
      const [y, nodes] = sortedRows[rowIndex]!
      nodes.sort((left, right) => left.x - right.x)
      for (let index = 1; index < nodes.length; index += 1) {
        const previous = nodes[index - 1]!
        expect(previous.x + previous.width).toBeLessThanOrEqual(nodes[index]!.x)
      }
      const nextRow = sortedRows[rowIndex + 1]
      if (nextRow) {
        const rowHeight = Math.max(...nodes.map((node) => node.height))
        expect(y + rowHeight).toBeLessThanOrEqual(nextRow[0])
      }
    }
  })

  it('生成 10000 节点保持在合理耗时内', () => {
    const startedAt = performance.now()
    const root = createScaleFixture({
      nodeCount: 10_000,
      connectionPattern: 'many-to-many',
      seed: 7,
    })
    const elapsedMs = performance.now() - startedAt
    const jsonBytes = new TextEncoder().encode(JSON.stringify(root)).byteLength

    expect(root.children).toHaveLength(10_000)
    expect(elapsedMs).toBeLessThan(1_000)
    expect(jsonBytes).toBeGreaterThan(1_000_000)
    expect(jsonBytes).toBeLessThan(10_000_000)
  })
})
