import { describe, expect, it, vi } from 'vitest'
import { createScaleFixture } from './scale-fixture'
import {
  createAiImageNode,
  createBoxNode,
  createFrameNode,
  type CanvasNode,
  type FrameNode,
} from './node-schema'
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

function observeVisibleReads(root: FrameNode): {
  root: FrameNode
  getVisibleReadCount: () => number
} {
  let visibleReadCount = 0
  const observe = (node: CanvasNode): CanvasNode => {
    const children = node.fwType === 'frame' ? node.children.map(observe) : undefined
    return new Proxy(node, {
      get(target, property, receiver) {
        if (property === 'visible') visibleReadCount += 1
        if (property === 'children' && children !== undefined) return children
        return Reflect.get(target, property, receiver)
      },
    })
  }

  return {
    root: observe(root) as FrameNode,
    getVisibleReadCount: () => visibleReadCount,
  }
}

function observeSortWork<T>(run: () => T): {
  result: T
  sortCallCount: number
  comparisonCount: number
} {
  const originalSort = Array.prototype.sort
  let sortCallCount = 0
  let comparisonCount = 0
  const sortSpy = vi.spyOn(Array.prototype, 'sort').mockImplementation(function (
    this: unknown[],
    compareFn?: (left: unknown, right: unknown) => number,
  ) {
    sortCallCount += 1
    const observedCompare =
      compareFn === undefined
        ? undefined
        : (left: unknown, right: unknown) => {
            comparisonCount += 1
            return compareFn(left, right)
          }
    return Reflect.apply(originalSort, this, [observedCompare]) as unknown[]
  })

  try {
    return { result: run(), sortCallCount, comparisonCount }
  } finally {
    sortSpy.mockRestore()
  }
}

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

  it('宽扁视口超过上限时，保留区按视口宽高比呈矩形而非圆形', () => {
    const root = createFrameNode({
      fwId: 'root',
      width: 400,
      height: 100,
      children: [
        createBoxNode({ fwId: 'center', x: 199, y: 49, width: 2, height: 2 }),
        createBoxNode({ fwId: 'wide-left', x: 39, y: 49, width: 2, height: 2 }),
        createBoxNode({ fwId: 'wide-right', x: 359, y: 49, width: 2, height: 2 }),
        createBoxNode({ fwId: 'near-top', x: 199, y: 4, width: 2, height: 2 }),
        createBoxNode({ fwId: 'near-bottom', x: 199, y: 94, width: 2, height: 2 }),
      ],
    })

    expect([
      ...getNodesInViewport(root, viewport, {
        width: 400,
        height: 100,
        overscan: 0,
        maxNodes: 4,
      }),
    ]).toEqual(['root', 'center', 'wide-left', 'wide-right'])
  })

  it('视口宽度为 0 时使用有限分母，仍按可用的纵向距离排序', () => {
    const root = createFrameNode({
      fwId: 'root',
      x: -1,
      width: 2,
      height: 100,
      children: [
        createBoxNode({ fwId: 'first-but-far', x: 0, y: 0, width: 2, height: 2 }),
        createBoxNode({ fwId: 'vertical-center', x: 0, y: 49, width: 2, height: 2 }),
      ],
    })

    expect([
      ...getNodesInViewport(root, viewport, {
        width: 0,
        height: 100,
        overscan: 0,
        maxNodes: 2,
      }),
    ]).toEqual(['root', 'vertical-center'])
  })

  it('半退化视口（一维为 0）退回各向同性，不产生极端拉伸的保留区', () => {
    // 0×800 这类形态出现在容器某一维被布局压塌时。
    // 若两维各自独立兜底成 1，会得到 halfW=1、halfH=400 —— 400 倍各向异性，
    // 保留区退化成一条竖条，几乎只按 x 排序。那比退回圆形还糟：
    // 圆形至少是各向同性的中性行为。这里断言横纵被一视同仁。
    const root = createFrameNode({
      fwId: 'root',
      width: 800,
      height: 800,
      children: [
        // 两个节点都必须横跨 x=0：零宽视口下候选过滤本身就是零宽的
        // （overscan 是比例，0 乘任何比例仍是 0），不跨过去就根本进不了候选。
        // 中心 (6, 400)：横向差 6px、纵向差 0 —— 真实距离上明显更近
        createBoxNode({ fwId: 'near-in-x', x: -2, y: 399, width: 16, height: 2 }),
        // 中心 (0, 301)：纵向差 99px
        createBoxNode({ fwId: 'far-in-y', x: -2, y: 300, width: 4, height: 2 }),
      ],
    })

    const kept = [
      ...getNodesInViewport(root, viewport, {
        width: 0,
        height: 800,
        overscan: 0,
        maxNodes: 2,
      }),
    ]

    // 视口中心 (0, 400)。各向同性兜底（两维都取 400）下：
    //   near-in-x = max(6/400, 0/400)  = 0.015
    //   far-in-y  = max(0/400, 99/400) = 0.2475   → near-in-x 更近 ✓
    // 而旧的「各兜各的」（halfW=1、halfH=400）下：
    //   near-in-x = max(6/1, 0/400)  = 6
    //   far-in-y  = max(0/1, 99/400) = 0.2475     → 结论反过来 ✗
    // 横向权重被放大 400 倍，一个 6px 的横向偏移被判得比 99px 的纵向偏移还远。
    expect(kept).toEqual(['root', 'near-in-x'])
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

  it('预算变化时不复用旧裁剪派生结果', () => {
    const root = createFrameNode({
      fwId: 'root',
      children: [createBoxNode({ fwId: 'child' })],
    })
    const previous = getViewportCullingResult(root, viewport, {
      ...screen,
      maxNodes: 2,
      maxConnections: 1,
    })

    expect(
      canReuseViewportCulling(previous, viewport, {
        ...screen,
        maxNodes: 1,
        maxConnections: 1,
      }),
    ).toBe(false)
    expect(
      canReuseViewportCulling(previous, viewport, {
        ...screen,
        maxNodes: 2,
        maxConnections: 0,
      }),
    ).toBe(false)
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

  it('10000 节点裁剪只遍历一次 node 树', () => {
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
    const observed = observeVisibleReads(root)

    getNodesInViewport(observed.root, viewport, screen)

    expect(observed.getVisibleReadCount()).toBe(10_001)
  })

  it('10000 节点全落入视口时，候选只物化一次且排序工作量保持 O(n log n)', () => {
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
    const observed = observeVisibleReads(root)
    const candidateCount = 10_001
    const comparisonBudget =
      2 * candidateCount * Math.ceil(Math.log2(candidateCount))

    const work = observeSortWork(() =>
      getNodesInViewport(observed.root, zoomedOut, fullCanvasScreen),
    )

    expect(work.result.size).toBe(DEFAULT_MAX_NODES)
    expect(observed.getVisibleReadCount()).toBe(candidateCount)
    expect(work.sortCallCount).toBe(1)
    expect(work.comparisonCount).toBeGreaterThan(0)
    expect(work.comparisonCount).toBeLessThanOrEqual(comparisonBudget)
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

  it('10000 节点 many-to-many 连线裁剪保持单次遍历、O(e log e) 排序并在预算处早停', () => {
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
    const observed = observeVisibleReads(root)
    const connectionCount = root.children.reduce(
      (count, node) => count + ('sourceFwIds' in node ? node.sourceFwIds.length : 0),
      0,
    )
    const comparisonBudget =
      2 * connectionCount * Math.ceil(Math.log2(connectionCount))
    const boundsCache = new ConnectionBoundsCache()
    const boundsGetSpy = vi.spyOn(boundsCache, 'get')

    const work = observeSortWork(() =>
      getConnectionsInViewport(
        observed.root,
        zoomedOut,
        fullCanvasScreen,
        boundsCache,
      ),
    )

    expect(work.result).toHaveLength(DEFAULT_MAX_CONNECTIONS)
    expect(observed.getVisibleReadCount()).toBe(10_001)
    expect(work.sortCallCount).toBe(1)
    expect(work.comparisonCount).toBeGreaterThan(0)
    expect(work.comparisonCount).toBeLessThanOrEqual(comparisonBudget)
    expect(boundsGetSpy).toHaveBeenCalledTimes(DEFAULT_MAX_CONNECTIONS)
  })
})
