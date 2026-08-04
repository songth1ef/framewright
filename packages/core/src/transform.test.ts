import { describe, expect, it } from 'vitest'
import { createBoxNode, createFrameNode, type FrameNode } from './node-schema'
import { computeMoves, MIN_NODE_SIZE, resizeProportional } from './transform'

describe('MIN_NODE_SIZE', () => {
  it('统一为 32 画布 px', () => {
    expect(MIN_NODE_SIZE).toBe(32)
  })
})

/**
 * root(0,0)
 * ├── box-a(10,10)
 * ├── frame-f(100,100)
 * │   └── frame-g(10,10)
 * │       └── box-c(5,5)
 * └── box-locked(50,50, locked)
 */
function buildTree(): FrameNode {
  const boxA = createBoxNode({ fwId: 'box-a', x: 10, y: 10 })
  const boxC = createBoxNode({ fwId: 'box-c', x: 5, y: 5 })
  const frameG = createFrameNode({ fwId: 'frame-g', x: 10, y: 10, children: [boxC] })
  const frameF = createFrameNode({ fwId: 'frame-f', x: 100, y: 100, children: [frameG] })
  const boxLocked = createBoxNode({ fwId: 'box-locked', x: 50, y: 50, locked: true })
  return createFrameNode({ fwId: 'root', children: [boxA, frameF, boxLocked] })
}

describe('computeMoves', () => {
  it('输出父相对坐标并带上 parentFwId', () => {
    const moves = computeMoves(buildTree(), ['box-a'], { x: 5, y: 7 })
    expect(moves).toEqual([{ fwId: 'box-a', parentFwId: 'root', x: 15, y: 17 }])
  })

  it('父子同选时只保留最上层，后代不出现', () => {
    const moves = computeMoves(buildTree(), ['frame-f', 'box-c'], { x: 1, y: 1 })
    expect(moves.map((m) => m.fwId)).toEqual(['frame-f'])
  })

  it('任一祖先被选中都跳过（祖父选中，孙节点不出现）', () => {
    const moves = computeMoves(buildTree(), ['frame-f', 'box-c'], { x: 0, y: 0 })
    expect(moves.find((m) => m.fwId === 'box-c')).toBeUndefined()
  })

  it('多层嵌套下 parentFwId 正确、x/y 是父相对', () => {
    const moves = computeMoves(buildTree(), ['box-c'], { x: 3, y: 4 })
    expect(moves).toEqual([{ fwId: 'box-c', parentFwId: 'frame-g', x: 8, y: 9 }])
  })

  it('locked 节点被排除', () => {
    expect(computeMoves(buildTree(), ['box-locked'], { x: 1, y: 1 })).toEqual([])
  })

  it('不修改入参', () => {
    const tree = buildTree()
    const selection = ['box-a']
    const delta = { x: 5, y: 5 }
    computeMoves(tree, selection, delta)
    expect(tree.children[0]).toMatchObject({ fwId: 'box-a', x: 10, y: 10 })
    expect(selection).toEqual(['box-a'])
    expect(delta).toEqual({ x: 5, y: 5 })
  })
})

describe('resizeProportional', () => {
  // orig: 2:1 比例
  const orig = { x: 100, y: 100, width: 200, height: 100 }
  const opts = { minSize: 50 }

  it('拖 se 固定 nw 角', () => {
    // 指针 (500,250)：宽向缩放 2、高向缩放 1.5 → 取较大口径
    expect(resizeProportional(orig, 'se', { x: 500, y: 250 }, opts)).toEqual({
      x: 100,
      y: 100,
      width: 400,
      height: 200,
    })
  })

  it('拖 nw 固定 se 角', () => {
    // 指针 (0,0)：宽向 1.5、高向 2 → 取较大口径；新左上角随尺寸回推
    expect(resizeProportional(orig, 'nw', { x: 0, y: 0 }, opts)).toEqual({
      x: -100,
      y: 0,
      width: 400,
      height: 200,
    })
  })

  it('拖 ne 固定 sw 角', () => {
    expect(resizeProportional(orig, 'ne', { x: 500, y: 50 }, opts)).toEqual({
      x: 100,
      y: 0,
      width: 400,
      height: 200,
    })
  })

  it('拖 sw 固定 ne 角', () => {
    expect(resizeProportional(orig, 'sw', { x: 0, y: 300 }, opts)).toEqual({
      x: -100,
      y: 100,
      width: 400,
      height: 200,
    })
  })

  it('等比约束成立：新宽高比 == 原宽高比', () => {
    const result = resizeProportional(orig, 'se', { x: 450, y: 220 }, opts)
    expect(result.width / result.height).toBeCloseTo(orig.width / orig.height, 10)
  })

  it('minSize 钳制生效且保持比例', () => {
    // 指针几乎贴着固定角：两个口径都小于 minSize。宽高都须 ≥ 50 且保持 2:1
    // → 高钳到 50、宽随之 100（若只钳宽到 50，高 25 仍违反钳制）
    const result = resizeProportional(orig, 'se', { x: 105, y: 102 }, opts)
    expect(result).toEqual({ x: 100, y: 100, width: 100, height: 50 })
  })

  it('不修改入参', () => {
    const input = { ...orig }
    const pointer = { x: 500, y: 250 }
    resizeProportional(input, 'se', pointer, opts)
    expect(input).toEqual(orig)
    expect(pointer).toEqual({ x: 500, y: 250 })
  })
})
