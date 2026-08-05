import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import { createAiImageNode, createBoxNode, createFrameNode } from './node-schema'
import {
  ConnectionBoundsCache,
  canReuseViewportCulling,
  getConnectionsInViewport,
  getNodesInViewport,
  getViewportCullingResult,
} from './viewport-culling'

const viewport = { scale: 1, offsetX: 0, offsetY: 0 }
const screen = { width: 100, height: 100 }

describe('getNodesInViewport', () => {
  it('默认挂载区域是向外扩一个视口尺寸的 3x3 区域，并可配置', () => {
    const root = createFrameNode({
      fwId: 'root',
      width: 100,
      height: 100,
      children: [
        createBoxNode({ fwId: 'inside', x: 20, y: 20, width: 10, height: 10 }),
        createBoxNode({ fwId: 'buffered', x: 150, y: 20, width: 10, height: 10 }),
        createBoxNode({ fwId: 'outside', x: 210, y: 20, width: 10, height: 10 }),
      ],
    })

    expect([...getNodesInViewport(root, viewport, screen)]).toEqual([
      'root',
      'inside',
      'buffered',
    ])
    expect([...getNodesInViewport(root, viewport, { ...screen, overscan: 0 })]).toEqual([
      'root',
      'inside',
    ])
  })

  it('保留与挂载区域跨边界相交的节点', () => {
    const root = createFrameNode({
      fwId: 'root',
      width: 100,
      height: 100,
      children: [createBoxNode({ fwId: 'crossing', x: 95, y: 20, width: 20, height: 20 })],
    })

    expect(getNodesInViewport(root, viewport, { ...screen, overscan: 0 }).has('crossing')).toBe(
      true,
    )
  })

  it('缩放后按 screenToCanvas 换算出的画布区域判定', () => {
    const root = createFrameNode({
      fwId: 'root',
      width: 500,
      height: 500,
      children: [
        createBoxNode({ fwId: 'inside-after-zoom', x: 45, y: 20, width: 5, height: 5 }),
        createBoxNode({ fwId: 'outside-after-zoom', x: 60, y: 20, width: 5, height: 5 }),
      ],
    })

    const ids = getNodesInViewport(
      root,
      { scale: 2, offsetX: 0, offsetY: 0 },
      { ...screen, overscan: 0 },
    )
    expect(ids.has('inside-after-zoom')).toBe(true)
    expect(ids.has('outside-after-zoom')).toBe(false)
  })

  it('叠加 visible 级联语义，隐藏 frame 的后代即使在视口内也不挂载', () => {
    const root = createFrameNode({
      fwId: 'root',
      width: 100,
      height: 100,
      children: [
        createBoxNode({ fwId: 'hidden-leaf', x: 10, y: 10, visible: false }),
        createFrameNode({
          fwId: 'hidden-frame',
          visible: false,
          children: [createBoxNode({ fwId: 'hidden-descendant', x: 10, y: 10 })],
        }),
      ],
    })

    expect([...getNodesInViewport(root, viewport, screen)]).toEqual(['root'])
  })

  it('只在当前真实视口仍被上次扩展挂载区完整包含时允许复用', () => {
    const root = createFrameNode({
      fwId: 'root',
      width: 1_000,
      height: 100,
      children: [
        createBoxNode({ fwId: 'buffered', x: 150, y: 20, width: 10, height: 10 }),
        createBoxNode({ fwId: 'next', x: 250, y: 20, width: 10, height: 10 }),
      ],
    })
    const previous = getViewportCullingResult(root, viewport, screen)

    expect(previous.nodeIds.has('buffered')).toBe(true)
    expect(previous.nodeIds.has('next')).toBe(false)
    expect(canReuseViewportCulling(previous, { ...viewport, offsetX: -100 }, screen)).toBe(true)
    expect(canReuseViewportCulling(previous, { ...viewport, offsetX: -101 }, screen)).toBe(false)

    const refreshed = getViewportCullingResult(root, { ...viewport, offsetX: -101 }, screen)
    expect(refreshed.nodeIds.has('next')).toBe(true)
  })

  it('10000 节点裁剪保持在 1ms 级', () => {
    const children = Array.from({ length: 10_000 }, (_, index) =>
      createBoxNode({
        fwId: `node-${index}`,
        x: (index % 100) * 20,
        y: Math.floor(index / 100) * 20,
        width: 10,
        height: 10,
      }),
    )
    const root = createFrameNode({ fwId: 'root', width: 2_000, height: 2_000, children })

    for (let index = 0; index < 10; index += 1) getNodesInViewport(root, viewport, screen)
    const startedAt = performance.now()
    for (let index = 0; index < 20; index += 1) getNodesInViewport(root, viewport, screen)
    const averageMs = (performance.now() - startedAt) / 20

    expect(averageMs).toBeLessThan(5)
  })
})

describe('getConnectionsInViewport', () => {
  it('按连线自身包围盒裁剪：两端都在视口外但横穿视口时仍保留', () => {
    const root = createFrameNode({
      fwId: 'root',
      width: 100,
      height: 100,
      children: [
        createBoxNode({ fwId: 'source', x: -200, y: 40, width: 20, height: 20 }),
        createAiImageNode({
          fwId: 'target',
          x: 300,
          y: 10,
          width: 20,
          height: 80,
          sourceFwIds: ['source'],
        }),
      ],
    })

    const connections = getConnectionsInViewport(root, viewport, { ...screen, overscan: 0 })
    expect(connections).toHaveLength(1)
    expect(connections[0]).toMatchObject({ fromFwId: 'source', toFwId: 'target' })
  })

  it('排除包围盒在挂载区域外的连线，并叠加 hidden 语义', () => {
    const root = createFrameNode({
      fwId: 'root',
      width: 100,
      height: 100,
      children: [
        createBoxNode({ fwId: 'visible-source', x: 300, y: 300 }),
        createAiImageNode({
          fwId: 'outside-target',
          x: 500,
          y: 300,
          sourceFwIds: ['visible-source'],
        }),
        createBoxNode({ fwId: 'hidden-source', x: -100, y: 50, visible: false }),
        createAiImageNode({
          fwId: 'inside-target',
          x: 50,
          y: 50,
          sourceFwIds: ['hidden-source'],
        }),
      ],
    })

    expect(getConnectionsInViewport(root, viewport, { ...screen, overscan: 0 })).toEqual([])
  })

  it('端点节点几何变化后使包围盒缓存失效', () => {
    const cache = new ConnectionBoundsCache()
    const makeRoot = (targetX: number) =>
      createFrameNode({
        fwId: 'root',
        width: 1_000,
        height: 500,
        children: [
          createBoxNode({ fwId: 'source', x: 300, y: 20, width: 20, height: 20 }),
          createAiImageNode({
            fwId: 'target',
            x: targetX,
            y: 20,
            width: 20,
            height: 20,
            sourceFwIds: ['source'],
          }),
        ],
      })

    expect(
      getConnectionsInViewport(makeRoot(400), viewport, { ...screen, overscan: 0 }, cache),
    ).toEqual([])
    expect(
      getConnectionsInViewport(makeRoot(70), viewport, { ...screen, overscan: 0 }, cache),
    ).toHaveLength(1)
  })
})
