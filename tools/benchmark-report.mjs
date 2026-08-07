#!/usr/bin/env node
/**
 * 统一基准 JSON → Markdown 三方对照表。
 *
 *   node tools/benchmark-report.mjs benchmarks/results/<最新>.json
 *
 * 输出到 stdout，便于重定向或管道。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const inputPath = process.argv.find((arg) => !arg.startsWith('--') && arg !== process.argv[0] && arg !== process.argv[1])
if (inputPath === undefined) {
  console.error('用法：node tools/benchmark-report.mjs benchmarks/results/<文件名>.json')
  process.exit(1)
}

const report = JSON.parse(readFileSync(path.resolve(inputPath), 'utf8'))

const RENDERER_ORDER = ['dom', 'leafer', 'reactflow']
const RENDERER_LABELS = {
  dom: 'DOM',
  leafer: 'Leafer',
  reactflow: 'React Flow',
}

const ALL_METRICS = [
  { key: 'mount', label: '挂载数', width: 8 },
  { key: 'drag', label: '拖拽 fps', width: 10 },
  { key: 'pan', label: '平移 fps', width: 10 },
  { key: 'firstScreen', label: '首屏 ms', width: 10 },
  { key: 'memory', label: '内存 Δ', width: 10 },
]

function scenarioById(rendererKey, id) {
  return report.renderers[rendererKey]?.scenarios.find((candidate) => candidate.id === id)
}

function median(values) {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

function formatInt(value) {
  return Number.isFinite(value) ? String(Math.round(value)) : '—'
}

function formatFixed(value, digits) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—'
}

function rendererMemoryDeltaMB(scenario) {
  const deltas = []
  for (const sample of scenario.samples ?? []) {
    if (sample.status !== 'completed') continue
    const baseline = sample.memory?.baseline?.byProcess?.renderer?.rssBytes
    const after = sample.memory?.afterScenario?.byProcess?.renderer?.rssBytes
    if (typeof baseline === 'number' && typeof after === 'number') {
      deltas.push(after - baseline)
    }
  }
  if (deltas.length === 0) return undefined
  return median(deltas) / 1024 / 1024
}

function mountedLogicalNodeCount(scenario) {
  const values = []
  for (const sample of scenario.samples ?? []) {
    if (sample.status === 'completed' && typeof sample.firstScreen?.mountedLogicalNodeCount === 'number') {
      values.push(sample.firstScreen.mountedLogicalNodeCount)
    }
  }
  return values.length > 0 ? median(values) : undefined
}

function cellValue(rendererKey, scenario, metricKey) {
  if (scenario === undefined || scenario.status !== 'completed') {
    return { value: '—', missing: true }
  }
  switch (metricKey) {
    case 'mount': {
      const value = mountedLogicalNodeCount(scenario)
      return { value: formatInt(value), missing: value === undefined }
    }
    case 'drag': {
      const value = scenario.aggregate?.drag?.avgFps?.median
      return { value: formatFixed(value, 1), missing: !Number.isFinite(value) }
    }
    case 'pan': {
      const value = scenario.aggregate?.pan?.avgFps?.median
      return { value: formatFixed(value, 1), missing: !Number.isFinite(value) }
    }
    case 'firstScreen': {
      const value = scenario.aggregate?.firstScreen?.elapsedMs?.median
      return { value: formatFixed(value, 0), missing: !Number.isFinite(value) }
    }
    case 'memory': {
      const value = rendererMemoryDeltaMB(scenario)
      return { value: value === undefined ? '—' : `${formatFixed(value, 1)} MB`, missing: value === undefined }
    }
    default:
      return { value: '—', missing: true }
  }
}

function statusReason(rendererKey, scenario, scenarioId) {
  const label = RENDERER_LABELS[rendererKey]
  if (scenario === undefined) {
    return `${label}：未运行（本次 --only 或失败导致无数据）`
  }
  if (scenario.status === 'completed') return undefined
  const reason = scenario.reason ?? scenario.error ?? `status=${scenario.status}`
  return `${label}：${scenarioId} 状态 ${scenario.status} — ${reason}`
}

function collectParamDifferences(matrixScenario, rendererScenario) {
  if (rendererScenario === undefined) return '未运行'
  const keys = Object.keys(rendererScenario).filter(
    (key) => !(key in matrixScenario) && !['status', 'requestedSampleCount', 'completedSampleCount', 'samples', 'aggregate', 'browser'].includes(key),
  )
  if (keys.length === 0) return '与基准矩阵一致'
  return keys
    .map((key) => {
      const value = rendererScenario[key]
      return `${key}=${JSON.stringify(value)}`
    })
    .join('、')
}

function pad(value, width) {
  const str = String(value)
  return str.length >= width ? str : ' '.repeat(width - str.length) + str
}

function buildTableRow(cells, widths) {
  return `| ${cells.map((cell, index) => pad(cell, widths[index])).join(' | ')} |`
}

function renderLayerSection(layerKey, description) {
  const scenarios = report.matrix.scenarios.filter((scenario) => scenario.layer === layerKey)
  if (scenarios.length === 0) return ''

  const scenarioWidth = Math.max(20, ...scenarios.map((s) => s.label.length))
  const headerWidths = [scenarioWidth, ...RENDERER_ORDER.flatMap(() => ALL_METRICS.map((m) => m.width))]

  const lines = []
  lines.push(`### ${layerKey} 层：${description}`)
  lines.push('')

  const headerLabels = ['场景', ...RENDERER_ORDER.flatMap((rendererKey) => ALL_METRICS.map((m) => `${RENDERER_LABELS[rendererKey]} ${m.label}`))]
  lines.push(buildTableRow(headerLabels, headerWidths))
  // 第一列左对齐，其余数值列右对齐。
  lines.push(`| :${'-'.repeat(headerWidths[0])} |${headerWidths.slice(1).map((w) => ` ${'-'.repeat(w)}: |`).join('')}`)

  const notes = []

  for (const scenario of scenarios) {
    const cells = [scenario.label]
    for (const rendererKey of RENDERER_ORDER) {
      const rendererScenario = scenarioById(rendererKey, scenario.id)
      let rendererHasMissing = false
      for (const metric of ALL_METRICS) {
        const { value, missing } = cellValue(rendererKey, rendererScenario, metric.key)
        cells.push(value)
        if (missing) rendererHasMissing = true
      }
      if (rendererHasMissing) {
        const reason = statusReason(rendererKey, rendererScenario, scenario.id)
        if (reason !== undefined) {
          notes.push(`- **${scenario.label}**：${reason}`)
        }
      }
    }
    lines.push(buildTableRow(cells, headerWidths))
  }

  lines.push('')

  if (notes.length > 0) {
    lines.push('**缺失 / 异常说明：**')
    lines.push(...notes)
    lines.push('')
  }

  return lines.join('\n')
}

function renderWarnings() {
  return [
    '⚠️ **首屏那一列必须带警告**：本仓已确认两侧仪表曾不对称（`architecture.md` §8.8.1）。',
    '此前 DOM 首屏 5–6 秒、Leafer 首屏 10–85ms 的 60 倍差距，根因是 Leafer 探针没有等待图片下载。',
    '补上仪表后，同档首屏量级一致。此外 picsum 首字节约 5.5–6.6 秒，会主导首屏耗时。',
    '因此**首屏数字只宜做同次同机器、同仪表条件下的相对对比，不宜直接跨报告比较绝对值**。',
    '',
  ].join('\n')
}

function renderMachineBlock() {
  const machine = report.machine ?? {}
  const totalGB = machine.totalMemoryBytes ? (machine.totalMemoryBytes / 1024 / 1024 / 1024).toFixed(1) : '—'
  return [
    '- 平台：' + (machine.platform ?? '—'),
    '- 系统：' + (machine.release ?? '—'),
    '- 架构：' + (machine.arch ?? '—'),
    '- CPU：' + (machine.cpuModel ?? '—'),
    '- 核心：' + (machine.cpuCount ?? '—'),
    '- 内存：' + totalGB + ' GB',
  ].join('\n')
}

function renderCalibrationSection() {
  const lines = []
  lines.push('## 口径声明')
  lines.push('')
  lines.push('### 机器信息')
  lines.push(renderMachineBlock())
  lines.push('')
  lines.push('### 采样与代码状态')
  lines.push(`- 每场景采样次数：**${report.samplesPerScenario ?? '—'}**`)
  lines.push(`- 代码 commit：${report.git?.commit ?? '—'}${report.git?.dirty ? '（工作区有未提交改动）' : ''}`)
  lines.push(`- 报告生成时间：${new Date().toISOString()}`)
  lines.push('')
  lines.push('### 各渲染器实际场景参数差异')
  lines.push('')
  lines.push('| 渲染器 | 每场景额外字段 | 说明 |')
  lines.push('|---|---|---|')
  for (const rendererKey of RENDERER_ORDER) {
    const firstScenario = report.matrix.scenarios[0]
    const rendererScenario = firstScenario ? scenarioById(rendererKey, firstScenario.id) : undefined
    const diff = collectParamDifferences(firstScenario ?? {}, rendererScenario ?? {})
    const note = rendererKey === 'reactflow'
      ? '必须预裁剪，否则 React Flow 会全树渲染，无法与 DOM/Leafer 同题对照。'
      : '使用生产 renderer 自带的视口裁剪，不额外注入参数。'
    lines.push(`| ${RENDERER_LABELS[rendererKey]} | ${diff} | ${note} |`)
  }
  lines.push('')
  lines.push('> 上述「额外字段」取自该渲染器 workload.scenarios 的第一个场景；矩阵里其余场景字段相同。')
  lines.push('')
  return lines.join('\n')
}

function renderReport() {
  const lines = []
  lines.push('# framewright 三方渲染器对照报告')
  lines.push('')
  lines.push(`- 基准跑批时间：${report.startedAt ?? '—'}`)
  lines.push(`- 文件：${path.basename(inputPath)}`)
  lines.push('')
  lines.push(renderWarnings())

  const layerKeys = report.matrix.layers ?? Object.keys(report.matrix.scenarios.reduce((acc, s) => { acc[s.layer] = true; return acc }, {}))
  const descriptions = {
    A: '规模曲线：节点数 × 缩放',
    B: '连线形态扫描',
    C: '连线上限扫描',
    D: '极端规模',
  }
  for (const layerKey of layerKeys) {
    const section = renderLayerSection(layerKey, descriptions[layerKey] ?? layerKey)
    if (section) lines.push(section)
  }

  lines.push(renderCalibrationSection())
  return lines.join('\n')
}

console.log(renderReport())
