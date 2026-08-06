/**
 * 统一性能基准的矩阵定义。
 *
 * 🔴 为什么不做全笛卡尔积：
 * 2 渲染器 × 3 节点数 × 5 缩放 × 4 连线 × 3 媒体 = 360 组合，每组 4 场景 × 5 次采样
 * ≈ 17 小时。所以拆成「一层主网格 + 三层受控扫描」：主网格答规模曲线，扫描层各自
 * 只动一个变量，其余固定。**每一层都写明固定了什么** —— 不写清楚的话，日后看数据
 * 的人会以为它覆盖了没覆盖的维度（本仓 §8.3 就吃过这个亏：视频维度的结论被当成了
 * 全维度结论）。
 */

/** 主网格固定项。改这里等于改所有 A 层数据的口径，改了必须重跑全部 A 层。 */
export const BASE = Object.freeze({
  seed: 7,
  connectionPattern: 'many-to-many',
  sampleWindowMs: 3000,
  longFrameThresholdMs: 50,
})

const SCALES = Object.freeze([
  { key: '800', label: '800%', initialScale: 8 },
  { key: '100', label: '100%', initialScale: 1 },
  { key: '50', label: '50%', initialScale: 0.5 },
  { key: '25', label: '25%', initialScale: 0.25 },
  { key: '10', label: '10%', initialScale: 0.1 },
])

const NODE_COUNTS = Object.freeze([100, 1000, 10000])

/** A 层：规模曲线。节点数 × 缩放，连线与媒体固定。15 组合 / 渲染器。 */
function layerA() {
  const scenarios = []
  for (const nodeCount of NODE_COUNTS) {
    for (const scale of SCALES) {
      scenarios.push({
        id: `A-n${nodeCount}-z${scale.key}`,
        label: `A 规模 · ${nodeCount} 节点 · ${scale.label}`,
        layer: 'A',
        nodeCount,
        connectionPattern: BASE.connectionPattern,
        initialScale: scale.initialScale,
        holds: `连线=${BASE.connectionPattern}、媒体=混合`,
      })
    }
  }
  return scenarios
}

/**
 * B 层：连线扫描。固定 1000 节点 + 100%，只动连线。
 * 连线已被实测证明是最大性能杠杆（1499 节点，有无 1000 条线差 22.54 vs 44.09 fps），
 * 且「上限只截输出不截工作量」的陷阱也出在这里，值得单独成层。
 */
function layerB() {
  return ['none', 'fanin', 'distributed', 'many-to-many'].map((pattern) => ({
    id: `B-conn-${pattern}`,
    label: `B 连线 · ${pattern}`,
    layer: 'B',
    nodeCount: 1000,
    connectionPattern: pattern,
    initialScale: 1,
    holds: '节点数=1000、缩放=100%、媒体=混合',
  }))
}

/**
 * C 层：连线上限扫描。同一份 many-to-many 负载下改 maxConnections，
 * 用来分离「渲染了几条」与「算了几条」—— 本仓记过这两者被混淆的坑。
 */
function layerC() {
  return [0, 128, 512, 1000].map((maxConnections) => ({
    id: `C-maxconn-${maxConnections}`,
    label: `C 连线上限 · ${maxConnections}`,
    layer: 'C',
    nodeCount: 1000,
    connectionPattern: 'many-to-many',
    initialScale: 1,
    maxConnections,
    holds: '节点数=1000、缩放=100%、连线=many-to-many',
  }))
}

/** D 层：极端规模。10000 节点在最容易暴露差异的两档缩放上，连线开/关各一次。 */
function layerD() {
  const scenarios = []
  for (const pattern of ['none', 'many-to-many']) {
    for (const scale of [SCALES[1], SCALES[4]]) {
      scenarios.push({
        id: `D-n10000-${pattern}-z${scale.key}`,
        label: `D 极端 · 10000 节点 · ${pattern} · ${scale.label}`,
        layer: 'D',
        nodeCount: 10000,
        connectionPattern: pattern,
        initialScale: scale.initialScale,
        holds: '节点数=10000、媒体=混合',
      })
    }
  }
  return scenarios
}

const LAYERS = { A: layerA, B: layerB, C: layerC, D: layerD }

/** @param {string[]} wanted 层名数组，空则全要。 */
export function buildMatrix(wanted) {
  const keys = wanted.length > 0 ? wanted : Object.keys(LAYERS)
  const unknown = keys.filter((key) => !(key in LAYERS))
  if (unknown.length > 0) throw new Error(`未知层：${unknown.join(', ')}（可选 A B C D）`)
  return keys.flatMap((key) => LAYERS[key]())
}

export const LAYER_DESCRIPTIONS = Object.freeze({
  A: '规模曲线：节点数(100/1000/10000) × 缩放(800/100/50/25/10%)，连线与媒体固定',
  B: '连线形态扫描：none / fanin / distributed / many-to-many，其余固定',
  C: '连线上限扫描：maxConnections 0/128/512/1000，分离「渲染几条」与「算了几条」',
  D: '极端规模：10000 节点 × 连线开关 × 100%/10%',
})
