/**
 * 统一性能基准入口。
 *
 * 一条命令跑完 DOM 与 LeaferJS 两侧的全维度组合，产出**一份**合并 JSON。
 *
 *   node tools/benchmark.mjs                     # 全部四层
 *   node tools/benchmark.mjs --layers=A          # 只跑规模曲线
 *   node tools/benchmark.mjs --only=dom --samples=3
 *   node tools/benchmark.mjs --out-dir=<dir>     # 默认 benchmarks/results（已 gitignore）
 *
 * 设计要点：
 *
 * - **不重写浏览器侧**。场景对象的形状与 probes/probe-config.mjs 内置的一致，
 *   直接经 `--scenarios-file` 注入现成的 runner，沿用它已有的证据纪律
 *   （画面指纹、解码帧计数、每样本独立子进程）。
 * - **两侧同题**：同一份矩阵喂给两个 runner，逐字段可核对。跨渲染器对比只有在
 *   `machine` 与 `workload` 都对得上时才成立 —— 本仓 2026-08-06 曾因跨机器对比
 *   把「换了台机器」误判成代码收益。
 * - **产物不入 git**：`benchmarks/results/` 已在 .gitignore。probes/results 留给
 *   随提交入库的定点取证数据，两者不要混。
 *
 * ⚠️ 尚未实现：`--base-url` 抓线上环境。现有 runner 用的是进程内合成夹具（虚拟
 * host + 注入文档），不经过真实应用与网络。要抓线上必须换一条「用 API 建文档 →
 * 打开真实画布页 → 跑同一套操作序列」的路径，那是独立一块，没做就不假装有。
 */
import { spawn } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildMatrix, LAYER_DESCRIPTIONS, BASE } from './benchmark-matrix.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function option(name, fallback) {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))
  return raw === undefined ? fallback : raw.slice(name.length + 3)
}

const layers = option('layers', '').split(',').map((s) => s.trim()).filter(Boolean)
const only = option('only', '')
const samples = option('samples', '5')
const outDir = path.resolve(repoRoot, option('out-dir', 'benchmarks/results'))
const baseUrl = option('base-url', '')

if (baseUrl !== '') {
  throw new Error(
    '--base-url 尚未实现：现有 runner 跑的是进程内合成夹具，不经过真实应用与网络。\n' +
    '要抓线上需要另一条「API 建文档 → 打开真实画布页 → 同一套操作序列」的路径。\n' +
    '在它落地之前，这个参数只会给出看似成功实则测错对象的数据，故直接拒绝。',
  )
}

const RENDERERS = [
  { key: 'dom', label: 'HTML / DOM', runner: 'packages/renderer-dom/probes/run-zoom-out.mjs' },
  { key: 'leafer', label: 'LeaferJS', runner: 'packages/renderer-leafer/probes/run-zoom-out.mjs' },
  { key: 'reactflow', label: 'React Flow（探针）', runner: 'packages/renderer-reactflow/probes/run-zoom-out.mjs' },
]

/**
 * 为每个渲染器准备实际注入的场景文件。
 *
 * React Flow 必须带 `preCull: true` + `onlyRenderVisibleElements: false`，否则它会按
 * 原生行为全树渲染，和 DOM/Leafer 的「生产 renderer 自己做视口裁剪」口径不对等。
 * 这些差异直接写进该渲染器拿到的场景对象，并在最终 JSON 的 `renderers.reactflow.workload.scenarios`
 * 里可见 —— 口径不可见是本仓踩过多次的坑。
 */
function prepareScenariosFile(rendererKey, matrix, dir) {
  const file = path.join(dir, `scenarios-${rendererKey}.json`)
  const scenarios = matrix.map((scenario) => {
    if (rendererKey !== 'reactflow') return scenario
    return {
      ...scenario,
      preCull: true,
      onlyRenderVisibleElements: false,
    }
  })
  writeFileSync(file, JSON.stringify(scenarios))
  return file
}

function gitDescribe() {
  try {
    return {
      commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
      dirty: execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' }).trim() !== '',
    }
  } catch {
    return { commit: null, dirty: null }
  }
}

function runRenderer(renderer, scenariosFile, tmpOut) {
  return new Promise((resolve, reject) => {
    const args = [
      path.join(repoRoot, renderer.runner),
      `--scenarios-file=${scenariosFile}`,
      `--out-dir=${tmpOut}`,
      `--samples=${samples}`,
    ]
    const child = spawn(process.execPath, args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      // 逐档进度直接透传，长时间运行时能看到跑到哪了。
      for (const line of chunk.split('\n')) {
        if (line.includes('aggregate]')) process.stdout.write(`  [${renderer.key}] ${line.slice(0, 80)}…\n`)
      }
    })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code !== 0) return reject(new Error(`${renderer.key} runner 退出码 ${code}\n${stderr.slice(-2000)}`))
      const files = readdirSync(tmpOut).filter((f) => f.endsWith('.json'))
      if (files.length === 0) return reject(new Error(`${renderer.key} 没有产出结果文件`))
      const newest = files.map((f) => path.join(tmpOut, f))
        .sort((a, b) => readFileSync(b, 'utf8').length - readFileSync(a, 'utf8').length)[0]
      resolve(JSON.parse(readFileSync(newest, 'utf8')))
    })
  })
}

const matrix = buildMatrix(layers)
const targets = only === '' ? RENDERERS : RENDERERS.filter((r) => r.key === only)
if (targets.length === 0) throw new Error(`--only 不支持：${only}（可选 dom / leafer / reactflow）`)

console.log(`矩阵 ${matrix.length} 组合 × ${targets.length} 渲染器 × ${samples} 次采样`)
for (const [key, description] of Object.entries(LAYER_DESCRIPTIONS)) {
  if (layers.length === 0 || layers.includes(key)) console.log(`  ${key}: ${description}`)
}

const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'fw-bench-'))

const byRenderer = {}
const failures = {}
const scenariosFiles = {}
try {
  for (const renderer of targets) {
    console.log(`\n▶ ${renderer.label}`)
    const tmpOut = path.join(tmpRoot, renderer.key)
    mkdirSync(tmpOut, { recursive: true })
    const scenariosFile = prepareScenariosFile(renderer.key, matrix, tmpRoot)
    scenariosFiles[renderer.key] = scenariosFile
    try {
      byRenderer[renderer.key] = await runRenderer(renderer, scenariosFile, tmpOut)
    } catch (error) {
      // 🔴 一侧失败绝不能带走另一侧已经跑完的数据。
      // 首次跑全量时 DOM 侧 27 组合全部完成、Leafer 侧在某个档位抛错，
      // 而 finally 把临时目录删了 —— 一小时的有效数据一起没了。
      // 跑一小时的东西必须能部分交付，失败信息随产物一起留档。
      failures[renderer.key] = error.message
      console.error(`✗ ${renderer.label} 失败，已记录并继续：${error.message.split('\n')[0]}`)
    }
  }
} finally {
  rmSync(tmpRoot, { recursive: true, force: true })
}

const startedAt = new Date().toISOString()
const report = {
  benchmark: 'framewright-unified',
  startedAt,
  git: gitDescribe(),
  // 机器口径与负载口径都记：两者都对得上，跨次对比才成立。
  machine: byRenderer[targets[0].key]?.machine ?? null,
  matrix: { layers: layers.length === 0 ? Object.keys(LAYER_DESCRIPTIONS) : layers, base: BASE, scenarios: matrix },
  samplesPerScenario: Number(samples),
  renderers: byRenderer,
  // 空对象表示两侧都跑完了。非空时**这份数据是不完整的**，跨渲染器对比不成立 ——
  // 明写出来，免得日后有人拿半份数据下结论。
  failures,
}

mkdirSync(outDir, { recursive: true })
const stamp = startedAt.replace(/[:.]/g, '-')
const outFile = path.join(outDir, `benchmark-${stamp}-${report.git.commit ?? 'nogit'}.json`)
writeFileSync(outFile, JSON.stringify(report, null, 2))
console.log(`\n✓ 已写入 ${path.relative(repoRoot, outFile)}`)
if (report.git.dirty) console.log('⚠️ 工作区有未提交改动，这份数据对应的代码状态无法由 commit 唯一确定')
