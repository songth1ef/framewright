// @vitest-environment jsdom
import './leafer-test-stub'
import { describe, expect, it, vi } from 'vitest'
import {
  createAiImageNode,
  createBoxNode,
  createFrameNode,
  getConnectionsInViewport,
  type RenderContext,
} from '@framewright/core'
import { Leafer, Path } from 'leafer-ui'
import { LeaferViewportScene } from './viewport-culling'
import { createLeaferRenderer } from './index'

const screen = { width: 200, height: 200 }

function context(root: RenderContext['root'], offsetX = 0): RenderContext {
  return {
    root,
    selection: [],
    viewport: { scale: 1, offsetX, offsetY: 0 },
    callbacks: {
      onSelectionRequest: () => undefined,
      onNodesMove: () => undefined,
      onNodesResize: () => undefined,
      onNodesDelete: () => undefined,
      onViewportChange: () => undefined,
      onNodeActivate: () => undefined,
      onNodeAction: () => undefined,
    },
  }
}

function makeRoot() {
  return createFrameNode({
    fwId: 'root',
    width: 2_000,
    height: 500,
    children: [
      createBoxNode({ fwId: 'left', x: 20, y: 20, width: 40, height: 40 }),
      createBoxNode({ fwId: 'keeper', x: 350, y: 20, width: 40, height: 40 }),
      createBoxNode({ fwId: 'right', x: 550, y: 20, width: 40, height: 40 }),
      createBoxNode({ fwId: 'far', x: 1_200, y: 20, width: 40, height: 40 }),
    ],
  })
}

describe('LeaferViewportScene', () => {
  it('只挂载 core 裁剪集合内的节点', () => {
    const leafer = new Leafer()
    const scene = new LeaferViewportScene(leafer)

    scene.reconcile(context(makeRoot()), screen)

    expect(scene.getMountedNodeIds()).toEqual(['root', 'left', 'keeper'])
    expect(scene.getMountedUi('right')).toBeUndefined()
    expect(scene.getMountedUi('far')).toBeUndefined()
    scene.destroy()
    leafer.destroy()
  })

  it('裁剪不改变 RendererAdapter 的完整 bounds 与业务可见性语义', () => {
    const root = makeRoot()
    const renderer = createLeaferRenderer()
    const container = document.createElement('div')
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: screen.width,
      bottom: screen.height,
      ...screen,
      toJSON: () => ({}),
    })

    renderer.mount(container, context(root))

    expect(renderer.getRenderedBounds().get('far')).toEqual({
      x: 1_200,
      y: 20,
      width: 40,
      height: 40,
    })
    expect(renderer.getVisibleNodeIds()).toContain('far')
    renderer.destroy()
  })

  it('视口平移时按 fwId 增量增删，不重建仍在裁剪集合内的实例', () => {
    const leafer = new Leafer()
    const scene = new LeaferViewportScene(leafer)
    const root = makeRoot()
    scene.reconcile(context(root), screen)
    const rootUi = scene.getMountedUi('root')
    const keeperUi = scene.getMountedUi('keeper')
    const leftUi = scene.getMountedUi('left')
    if (leftUi === undefined) throw new Error('测试前置条件失败：left 未挂载')
    const destroyLeft = vi.spyOn(leftUi, 'destroy')

    scene.reconcile(context(root, -500), screen)

    expect(scene.getMountedNodeIds()).toEqual(['root', 'keeper', 'right'])
    expect(scene.getMountedUi('root')).toBe(rootUi)
    expect(scene.getMountedUi('keeper')).toBe(keeperUi)
    expect(scene.getMountedUi('right')).toBeDefined()
    expect(destroyLeft).toHaveBeenCalledOnce()
    scene.destroy()
    leafer.destroy()
  })

  it('同一叶子节点位置变化时保持 Leafer 实例对象身份', () => {
    const leafer = new Leafer()
    const scene = new LeaferViewportScene(leafer)
    const root = makeRoot()
    scene.reconcile(context(root), screen)
    const leftUi = scene.getMountedUi('left')
    const keeperUi = scene.getMountedUi('keeper')
    if (leftUi === undefined || keeperUi === undefined) {
      throw new Error('测试前置条件失败：叶子节点未挂载')
    }

    const movedRoot = createFrameNode({
      fwId: 'root',
      width: 2_000,
      height: 500,
      children: [
        createBoxNode({
          fwId: 'left',
          x: 35,
          y: 45,
          width: 40,
          height: 40,
          fill: '#123456',
        }),
        createBoxNode({ fwId: 'keeper', x: 350, y: 20, width: 40, height: 40 }),
        createBoxNode({ fwId: 'right', x: 550, y: 20, width: 40, height: 40 }),
        createBoxNode({ fwId: 'far', x: 1_200, y: 20, width: 40, height: 40 }),
      ],
    })
    scene.reconcile(context(movedRoot), screen)

    expect(scene.getMountedUi('left')).toBe(leftUi)
    expect(scene.getMountedUi('keeper')).toBe(keeperUi)
    expect(leftUi.x).toBe(35)
    expect(leftUi.y).toBe(45)
    expect(leftUi.fill).toBe('#123456')
    scene.destroy()
    leafer.destroy()
  })

  it('连线层使用 getConnectionsInViewport 的曲线裁剪结果', () => {
    const root = createFrameNode({
      fwId: 'root',
      width: 2_000,
      height: 500,
      children: [
        createAiImageNode({ fwId: 'source', x: -300, y: 50, width: 40, height: 40 }),
        createAiImageNode({
          fwId: 'crossing',
          x: 300,
          y: 50,
          width: 40,
          height: 40,
          sourceFwIds: ['source'],
        }),
        createAiImageNode({ fwId: 'far-source', x: 1_000, y: 250, width: 40, height: 40 }),
        createAiImageNode({
          fwId: 'far-target',
          x: 1_300,
          y: 250,
          width: 40,
          height: 40,
          sourceFwIds: ['far-source'],
        }),
      ],
    })
    const ctx = context(root)
    const expected = getConnectionsInViewport(root, ctx.viewport, screen)
    const leafer = new Leafer()
    const scene = new LeaferViewportScene(leafer)

    scene.reconcile(ctx, screen)

    const paths = (scene.getConnectionLayer()?.children ?? []).filter(
      (child) => (child as Path).tag === 'Path',
    )
    expect(expected).toHaveLength(1)
    expect(paths).toHaveLength(expected.length)
    scene.destroy()
    leafer.destroy()
  })

  it('连续 reconcile 时保持同一个连线层实例', () => {
    const root = createFrameNode({
      fwId: 'root',
      width: 2_000,
      height: 500,
      children: [
        createAiImageNode({ fwId: 'source', x: 20, y: 50, width: 40, height: 40 }),
        createAiImageNode({
          fwId: 'target',
          x: 120,
          y: 50,
          width: 40,
          height: 40,
          sourceFwIds: ['source'],
        }),
      ],
    })
    const leafer = new Leafer()
    const scene = new LeaferViewportScene(leafer)
    scene.reconcile(context(root), screen)
    const connectionLayer = scene.getConnectionLayer()

    scene.reconcile(context(root), screen)

    expect(connectionLayer).not.toBeNull()
    expect(scene.getConnectionLayer()).toBe(connectionLayer)
    expect(scene.getMountedUi('root')?.children?.[0]).toBe(connectionLayer)
    scene.destroy()
    leafer.destroy()
  })

  it('移出裁剪区与 scene 销毁都会 destroy 实例并清空注册表', () => {
    const leafer = new Leafer()
    const scene = new LeaferViewportScene(leafer)
    const root = makeRoot()
    scene.reconcile(context(root), screen)
    const leftUi = scene.getMountedUi('left')
    const rootUi = scene.getMountedUi('root')
    if (leftUi === undefined || rootUi === undefined) throw new Error('测试前置条件失败')
    const destroyLeft = vi.spyOn(leftUi, 'destroy')
    const destroyRoot = vi.spyOn(rootUi, 'destroy')

    scene.reconcile(context(root, -1_000), screen)
    expect(destroyLeft).toHaveBeenCalledOnce()

    scene.destroy()
    expect(destroyRoot).toHaveBeenCalledOnce()
    expect(scene.getMountedNodeIds()).toEqual([])
    expect(scene.getConnectionLayer()).toBeNull()
    leafer.destroy()
  })
})
