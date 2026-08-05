import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import { createScaleFixture } from './scale-fixture'
import { createAiImageNode, createBoxNode, createFrameNode } from './node-schema'
import { getContentBounds } from './viewport'
import { collectVisibleNodeIds } from './visibility'
import {
  DEFAULT_MAX_CONNECTIONS,
  DEFAULT_MAX_NODES,
  ConnectionBoundsCache,
  canReuseViewportCulling,
  getConnectionsInViewport,
  getNodesInViewport,
  getViewportCullingResult,
} from './viewport-culling'

const viewport = { scale: 1, offsetX: 0, offsetY: 0 }
const screen = { width: 100, height: 100 }

describe('getNodesInViewport', () => {
  it('连线显隐不改变 node 树的裁剪结果', () => {
    const root = createFrameNode({
      fwId: 'root',
      children: [
        createBoxNode({ fwId: 'source' }),
        createAiImageNode({ fwId: 'target', sourceFwIds: ['source'] }),
      ],
    })

    const visible = getNodesInViewport(root, viewport, {
      ...screen,
      connectionVisibility: 'visible',
    })
    const hidden = getNodesInViewport(root, viewport, {
      ...screen,
      connectionVisibility: 'hidden',
    })

    expect(hidden).toEqual(visible)
    expect(root.children[1]).toMatchObject({ fwId: 'target', sourceFwIds: ['source'] })
  })

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

  it('超过上限时保留距真实视口中心最近的节点，而不是按遍历顺序截断', () => {
    const root = createFrameNode({
      fwId: 'root',
      width: 100,
      height: 100,
      children: [
        createBoxNode({ fwId: 'first-but-far', x: 0, y: 0, width: 10, height: 10 }),
        createBoxNode({ fwId: 'nearest', x: 45, y: 45, width: 10, height: 10 }),
        createBoxNode({ fwId: 'second-nearest', x: 55, y: 45, width: 10, height: 10 }),
      ],
    })

    expect([
      ...getNodesInViewport(root, viewport, {
        ...screen,
        overscan: 0,
        maxNodes: 3,
      }),
    ]).toEqual(['root', 'nearest', 'second-nearest'])
  })

  it('最近节点位于嵌套 frame 时，祖先链计入上限并一并保留', () => {
    const root = createFrameNode({
      fwId: 'root',
      width: 100,
      height: 100,
      children: [
        createBoxNode({ fwId: 'direct-near', x: 55, y: 45, width: 10, height: 10 }),
        createFrameNode({
          fwId: 'parent',
          x: 40,
          y: 40,
          width: 80,
          height: 80,
          children: [
            createBoxNode({ fwId: 'nested-nearest', x: 5, y: 5, width: 10, height: 10 }),
          ],
        }),
      ],
    })

    expect([
      ...getNodesInViewport(root, viewport, {
        ...screen,
        overscan: 0,
        maxNodes: 3,
      }),
    ]).toEqual(['root', 'parent', 'nested-nearest'])
  })

  it.each([2, 1, 0.5, 0.25, 0.1, 0.01])('scale=%s 时挂载数不超过默认上限', (scale) => {
    const root = createScaleFixture({
      nodeCount: 10_000,
      connectionPattern: 'none',
      seed: 17,
    })
    const ids = getNodesInViewport(root, { scale, offsetX: 0, offsetY: 0 }, {
      width: root.width * scale,
      height: root.height * scale,
      overscan: 0,
    })

    expect(ids.size).toBeLessThanOrEqual(DEFAULT_MAX_NODES)
  })

  it('数量上限只约束裁剪结果，不改变完整树的可见性与几何语义', () => {
    const root = createFrameNode({
      fwId: 'root',
      x: 10,
      y: 20,
      width: 500,
      height: 400,
      children: Array.from({ length: 20 }, (_, index) =>
        createBoxNode({ fwId: `node-${index}`, x: index * 20, y: index * 10 }),
      ),
    })
    const expectedVisible = collectVisibleNodeIds(root)
    const expectedBounds = getContentBounds(root)

    expect(getNodesInViewport(root, viewport, { ...screen, maxNodes: 2 }).size).toBe(2)
    expect(collectVisibleNodeIds(root)).toEqual(expectedVisible)
    expect(getContentBounds(root)).toEqual(expectedBounds)
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

  it('触发数量上限后，平移会重新按新视口中心选择最近节点', () => {
    const root = createFrameNode({
      fwId: 'root',
      width: 1_000,
      height: 100,
      children: [
        createBoxNode({ fwId: 'left', x: 20, y: 20, width: 10, height: 10 }),
        createBoxNode({ fwId: 'right', x: 170, y: 20, width: 10, height: 10 }),
      ],
    })
    const options = { ...screen, maxNodes: 2 }
    const previous = getViewportCullingResult(root, viewport, options)

    expect(previous.nodeIds.has('left')).toBe(true)
    expect(canReuseViewportCulling(previous, { ...viewport, offsetX: -100 }, options)).toBe(false)
  })

  it('节点未触顶但连线可能触顶时，平移同样不能复用旧中心集合', () => {
    const root = createFrameNode({
      fwId: 'root',
      width: 1_000,
      height: 100,
      children: [
        createBoxNode({ fwId: 'source-a', x: 10 }),
        createBoxNode({ fwId: 'source-b', x: 20 }),
        createAiImageNode({
          fwId: 'target',
          x: 200,
          sourceFwIds: ['source-a', 'source-b'],
        }),
      ],
    })
    const options = { ...screen, maxNodes: 10, maxConnections: 1 }
    const previous = getViewportCullingResult(root, viewport, options)

    expect(previous.nodeIds.size).toBeLessThan(options.maxNodes)
    expect(canReuseViewportCulling(previous, { ...viewport, offsetX: -10 }, options)).toBe(false)
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

  it('10000 节点全落入视口并触发排序时，单次裁剪仍在 25ms 内', () => {
    const root = createScaleFixture({
      nodeCount: 10_000,
      connectionPattern: 'many-to-many',
      seed: 23,
    })
    const zoomedOut = { scale: 0.1, offsetX: 0, offsetY: 0 }
    const fullCanvasScreen = {
      width: root.width * zoomedOut.scale,
      height: root.height * zoomedOut.scale,
      overscan: 0,
    }

    getNodesInViewport(root, zoomedOut, fullCanvasScreen)
    const startedAt = performance.now()
    const ids = getNodesInViewport(root, zoomedOut, fullCanvasScreen)
    const elapsedMs = performance.now() - startedAt

    expect(ids.size).toBe(DEFAULT_MAX_NODES)
    expect(elapsedMs).toBeLessThan(25)
  })
})

describe('getConnectionsInViewport', () => {
  it('隐藏连线时在读取 node 树前短路，不进入几何与曲线求解', () => {
    const unreadableRoot = new Proxy({} as ReturnType<typeof createFrameNode>, {
      get: () => {
        throw new Error('隐藏连线时不应读取 node 树')
      },
    })

    expect(
      getConnectionsInViewport(unreadableRoot, viewport, {
        ...screen,
        connectionVisibility: 'hidden',
      }),
    ).toEqual([])
  })

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

  it('连线数量始终受默认上限约束', () => {
    const sourceFwIds = Array.from({ length: DEFAULT_MAX_CONNECTIONS + 10 }, (_, index) =>
      `source-${index}`,
    )
    const root = createFrameNode({
      fwId: 'root',
      width: 100,
      height: 100,
      children: [
        ...sourceFwIds.map((fwId, index) =>
          createBoxNode({ fwId, x: -200, y: index % 100, width: 20, height: 20 }),
        ),
        createAiImageNode({
          fwId: 'target',
          x: 300,
          y: 40,
          width: 20,
          height: 20,
          sourceFwIds,
        }),
      ],
    })

    expect(
      getConnectionsInViewport(root, viewport, { ...screen, overscan: 0 }),
    ).toHaveLength(DEFAULT_MAX_CONNECTIONS)
  })

  it('maxConnections=0 可显式关闭连线输出', () => {
    const root = createFrameNode({
      fwId: 'root',
      children: [
        createBoxNode({ fwId: 'source' }),
        createAiImageNode({ fwId: 'target', sourceFwIds: ['source'] }),
      ],
    })

    expect(
      getConnectionsInViewport(root, viewport, { ...screen, maxConnections: 0 }),
    ).toEqual([])
  })

  it('10000 节点 many-to-many 连线裁剪单次在 75ms 内且不超过上限', () => {
    const root = createScaleFixture({
      nodeCount: 10_000,
      connectionPattern: 'many-to-many',
      seed: 29,
    })
    const zoomedOut = { scale: 0.1, offsetX: 0, offsetY: 0 }
    const fullCanvasScreen = {
      width: root.width * zoomedOut.scale,
      height: root.height * zoomedOut.scale,
      overscan: 0,
    }

    getConnectionsInViewport(root, zoomedOut, fullCanvasScreen)
    const startedAt = performance.now()
    const connections = getConnectionsInViewport(root, zoomedOut, fullCanvasScreen)
    const elapsedMs = performance.now() - startedAt

    expect(connections).toHaveLength(DEFAULT_MAX_CONNECTIONS)
    expect(elapsedMs).toBeLessThan(75)
  })
})
