/**
 * React Flow S4 缩小档基准。父进程逐档隔离，单档超过 120 秒会记录 timeout 后继续。
 * 不启动、不停止任何 dev server。
 * 产物 JSON 顶层结构与 DOM / Leafer 侧完全一致，供 tools/benchmark.mjs 统一汇总。
 */

import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { REACT_FLOW_ZOOM_OUT_PROBE_WORKLOAD } from './probe-config.mjs'
import { describeMachine } from './probe-machine.mjs'
import { sampleProcessMemory, samplePageMetrics } from './probe-memory.mjs'
import { buildDragEvidence, buildPanEvidence } from './browser/sampling.mjs'
import { aggregateSamples } from './browser/repeated-sampling.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const distDir = path.join(here, '.dist')
const bundleFile = path.join(distDir, 'scale.iife.js')
const cssFile = path.join(distDir, 'renderer-reactflow.css')
// --out-dir 让统一基准（tools/benchmark.mjs）把产物写到 benchmarks/results（已 gitignore），
// 不污染 probes/results 里那些随提交入库的定点取证数据。
const resultsDir = process.argv.find((arg) => arg.startsWith('--out-dir='))
  ?.slice('--out-dir='.length) ?? path.join(here, 'results')
const host = 'http://react-flow-probe.local'
const workload = REACT_FLOW_ZOOM_OUT_PROBE_WORKLOAD
const memoryReason =
  '页面级 API 无法可靠覆盖 React 组件树、布局、合成层与浏览器进程总内存；performance.memory 仅代表部分 JS heap，故不采集。'
const caseId = process.argv.find((arg) => arg.startsWith('--case='))?.slice('--case='.length)
const onlyCaseId = process.argv
  .find((arg) => arg.startsWith('--only-case='))
  ?.slice('--only-case='.length)
const requestedConnectionPattern = process.argv
  .find((arg) => arg.startsWith('--connection-pattern='))
  ?.slice('--connection-pattern='.length)
const requestedMaxConnections = process.argv
  .find((arg) => arg.startsWith('--max-connections='))
  ?.slice('--max-connections='.length)
const supportedConnectionPatterns = new Set(['none', 'fanin', 'distributed', 'many-to-many'])
if (
  requestedConnectionPattern !== undefined &&
  !supportedConnectionPatterns.has(requestedConnectionPattern)
) {
  throw new Error(`--connection-pattern 不支持：${requestedConnectionPattern}`)
}
if (
  requestedMaxConnections !== undefined &&
  (!Number.isInteger(Number(requestedMaxConnections)) || Number(requestedMaxConnections) < 1)
) {
  throw new Error(`--max-connections 必须是正整数，收到：${requestedMaxConnections}`)
}
// --scenarios-file 让外部注入任意场景矩阵（tools/benchmark.mjs 用它跑全维度组合）。
// 场景对象的形状与 probe-config.mjs 里内置的完全一致，浏览器侧不需要任何改动。
const scenariosFileArg = process.argv.find((arg) => arg.startsWith('--scenarios-file='))
  ?.slice('--scenarios-file='.length)
const baseScenarios = scenariosFileArg === undefined
  ? workload.scenarios
  : JSON.parse(readFileSync(scenariosFileArg, 'utf8'))

const scenarios = baseScenarios.map((scenario) => requestedConnectionPattern === undefined
  ? scenario
  : { ...scenario, connectionPattern: requestedConnectionPattern })
  .map((scenario) => requestedMaxConnections === undefined
    ? scenario
    : { ...scenario, maxConnections: Number(requestedMaxConnections) })
  .filter((scenario) => onlyCaseId === undefined || scenario.id === onlyCaseId)
if (onlyCaseId !== undefined && scenarios.length === 0) {
  throw new Error(`--only-case 不支持：${onlyCaseId}`)
}

function screenshotFingerprint(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function trackImageDownloads(page) {
  const session = await page.context().newCDPSession(page)
  const imageRequestIds = new Set()
  const completed = new Map()
  await session.send('Network.enable')
  session.on('Network.responseReceived', (event) => {
    if (event.type === 'Image') imageRequestIds.add(event.requestId)
  })
  session.on('Network.loadingFinished', (event) => {
    if (imageRequestIds.has(event.requestId)) {
      completed.set(event.requestId, event.encodedDataLength)
    }
  })
  return {
    snapshot() {
      return {
        downloadedImageCount: completed.size,
        downloadedImageBytes: [...completed.values()].reduce((total, bytes) => total + bytes, 0),
      }
    },
  }
}

function positiveIntegerOption(name, fallback) {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--${name} 必须是正整数，收到：${raw}`)
  }
  return value
}

function nonNegativeIntegerOption(name, fallback) {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`--${name} 必须是非负整数，收到：${raw}`)
  }
  return value
}

const repeatCount = positiveIntegerOption('samples', workload.repeatCount)
const repeatCooldownMs = nonNegativeIntegerOption('cooldown-ms', workload.repeatCooldownMs)
const coolDown = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function buildBundle() {
  const pnpmDir = path.join(repoRoot, 'node_modules/.pnpm')
  const viteDirName = readdirSync(pnpmDir).find((dir) => dir.startsWith('vite@'))
  if (viteDirName === undefined) throw new Error('node_modules/.pnpm 下找不到 vite')
  const { build } = await import(
    pathToFileURL(path.join(pnpmDir, viteDirName, 'node_modules/vite/dist/node/index.js')).href
  )
  await build({
    root: path.join(here, 'browser'),
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      outDir: distDir,
      emptyOutDir: true,
      lib: { entry: 'scale-page.ts', formats: ['iife'], name: 'FwReactFlowScaleProbe', fileName: () => 'scale.iife.js' },
      minify: false,
    },
  })
}

async function runCase(id) {
  const scenario = scenarios.find((candidate) => candidate.id === id)
  if (scenario === undefined) throw new Error(`未知 S4 档位：${id}`)
  const [bundle, css] = await Promise.all([
    readFile(bundleFile, 'utf8'),
    readFile(cssFile, 'utf8'),
  ])
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({
      viewport: { width: workload.viewport.width, height: workload.viewport.height },
    })
    const imageDownloads = await trackImageDownloads(page)
    page.on('pageerror', (error) => console.error('[pageerror]', error.message))
    await page.route(`${host}/**`, (route) => {
      const url = new URL(route.request().url())
      if (url.pathname === '/') {
        return route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><html><head><link rel="stylesheet" href="/renderer-reactflow.css"></head><body style="margin:0"><div id="view" style="position:relative;width:${workload.viewport.viewWidth}px;height:${workload.viewport.viewHeight}px;overflow:hidden"></div><script src="/scale.iife.js"></script></body></html>`,
        })
      }
      if (url.pathname === '/scale.iife.js') {
        return route.fulfill({ contentType: 'text/javascript', body: bundle })
      }
      if (url.pathname === '/renderer-reactflow.css') {
        return route.fulfill({ contentType: 'text/css', body: css })
      }
      return route.abort()
    })

    console.log('S4_PHASE:load')
    await page.goto(host)
    await page.waitForFunction(() => window.__scaleProbe !== undefined)
    const browserName = await page.evaluate(() => navigator.userAgent)

    const browserCdp = await browser.newBrowserCDPSession()
    const pageCdp = await page.context().newCDPSession(page)
    // 挂载任何场景之前先采基线，后面只用「后 - 前」的差值。
    const memoryBaseline = await sampleProcessMemory(browserCdp)

    console.log('S4_PHASE:first-screen')
    const firstScreen = await page.evaluate((value) => window.__scaleProbe.mountScenario(value), scenario)
    const firstScreenFingerprint = screenshotFingerprint(await page.screenshot())
    const firstScreenDownloads = imageDownloads.snapshot()

    console.log('S4_PHASE:drag')
    await page.evaluate((value) => window.__scaleProbe.mountScenario(value), scenario)
    const dragStart = await page.evaluate(() => window.__scaleProbe.dragSnapshot())
    const dragSample = await page.evaluate(
      ({ ms, threshold }) => window.__scaleProbe.sampleDrag(ms, threshold),
      { ms: workload.sampleWindowMs, threshold: workload.longFrameThresholdMs },
    )
    const dragEnd = await page.evaluate(() => window.__scaleProbe.dragSnapshot())
    const dragEvidence = buildDragEvidence(dragStart, dragEnd)

    console.log('S4_PHASE:pan')
    await page.evaluate((value) => window.__scaleProbe.mountScenario(value), scenario)
    const panStart = await page.evaluate(() => window.__scaleProbe.panSnapshot())
    const panStartConnectionCount = await page.evaluate(
      () => window.__scaleProbe.mountedConnectionCount(),
    )
    const panStartFingerprint = screenshotFingerprint(await page.screenshot())
    const panSample = await page.evaluate(
      ({ ms, threshold, panDelta }) => window.__scaleProbe.samplePan(ms, threshold, panDelta),
      {
        ms: workload.sampleWindowMs,
        threshold: workload.longFrameThresholdMs,
        panDelta: workload.panDelta,
      },
    )
    const panEnd = await page.evaluate(() => window.__scaleProbe.panSnapshot())
    const panEndConnectionCount = await page.evaluate(
      () => window.__scaleProbe.mountedConnectionCount(),
    )
    const panEndFingerprint = screenshotFingerprint(await page.screenshot())
    const panEvidence = {
      ...buildPanEvidence(panStart, panEnd),
      visual: {
        startFingerprint: panStartFingerprint,
        endFingerprint: panEndFingerprint,
        fingerprintChanged: panStartFingerprint !== panEndFingerprint,
        mountedConnectionCountStart: panStartConnectionCount,
        mountedConnectionCountEnd: panEndConnectionCount,
        connectionCountChanged: panStartConnectionCount !== panEndConnectionCount,
      },
    }

    // 分进程真实 RSS（CDP 取 PID + ps 读 OS），与页面级 JS heap 分开记。
    // 基线在挂载任何场景之前采，用来做「同档位前后对比」——RSS 绝对值含共享库
    // 与浏览器自身开销，只有差值有意义。
    const memoryAfter = await sampleProcessMemory(browserCdp)
    const pageMetrics = await samplePageMetrics(pageCdp)

    const result = {
      ...scenario,
      status: 'completed',
      browser: browserName,
      firstScreen: {
        ...firstScreen,
        ...firstScreenDownloads,
        visualFingerprint: firstScreenFingerprint,
      },
      drag: { ...dragSample, avgFps: dragSample.fps, workEvidence: dragEvidence },
      pan: { ...panSample, avgFps: panSample.fps, workEvidence: panEvidence },
      memory: {
        baseline: memoryBaseline,
        afterScenario: memoryAfter,
        pageMetrics,
      },
    }
    console.log(`S4_RESULT:${JSON.stringify(result)}`)
  } finally {
    await browser.close()
  }
}

function runIsolatedCase(scenario) {
  return new Promise((resolve, reject) => {
    const childArgs = [fileURLToPath(import.meta.url), `--case=${scenario.id}`]
    if (requestedConnectionPattern !== undefined) {
      childArgs.push(`--connection-pattern=${requestedConnectionPattern}`)
    }
    if (requestedMaxConnections !== undefined) {
      childArgs.push(`--max-connections=${requestedMaxConnections}`)
    }
    // 子进程要能查到同一份场景表，否则 --case= 在子进程里找不到外部注入的档位。
    if (scenariosFileArg !== undefined) {
      childArgs.push(`--scenarios-file=${scenariosFileArg}`)
    }
    const child = spawn(process.execPath, childArgs, {
      cwd: repoRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let lastPhase = 'spawn'
    let settled = false
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
      for (const line of chunk.split(/\r?\n/u)) {
        if (line.startsWith('S4_PHASE:')) lastPhase = line.slice('S4_PHASE:'.length)
      }
    })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    const timer = setTimeout(() => {
      settled = true
      child.kill()
      resolve({
        ...scenario,
        status: 'timeout',
        timeoutMs: workload.caseTimeoutMs,
        lastPhase,
        reason: `${scenario.label} 单档超过 ${workload.caseTimeoutMs}ms，已终止该档并继续。`,
        memory: null,
        memoryReason,
      })
    }, workload.caseTimeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      if (!settled) reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      const marker = stdout.split(/\r?\n/u).find((line) => line.startsWith('S4_RESULT:'))
      if (code !== 0 || marker === undefined) {
        reject(new Error(`${scenario.id} 子进程失败（exit=${code}）：${stderr || stdout}`))
        return
      }
      resolve(JSON.parse(marker.slice('S4_RESULT:'.length)))
    })
  })
}

if (caseId !== undefined) {
  await runCase(caseId)
} else {
  await buildBundle()
  const results = {
    probe: 'renderer-reactflow-scale-s4-zoom-out',
    startedAt: new Date().toISOString(),
    machine: describeMachine(),
    workload: { ...workload, scenarios },
    sampling: {
      repeatCount,
      repeatCooldownMs,
      isolation: '每次样本启动独立子进程，并新建 browser 与 page',
    },
    memory: null,
    memoryReason,
    scenarios: [],
  }
  for (const scenario of scenarios) {
    const samples = []
    for (let sampleIndex = 1; sampleIndex <= repeatCount; sampleIndex += 1) {
      if (sampleIndex > 1 && repeatCooldownMs > 0) await coolDown(repeatCooldownMs)
      // 🔴 单个样本抛错不能带走整轮。runIsolatedCase 对「超时」已经是记录后继续，
      // 但对「子进程抛错」原先直接 reject，一个档位失败就把前面所有档位的结果一起丢了。
      // 跑一小时的矩阵必须能部分交付；失败原因随样本入档，不假装它跑过。
      let sample
      try {
        sample = await runIsolatedCase(scenario)
      } catch (error) {
        // 🔴 只留第一行会把真实错误砍掉。2026-08-07 排查 Leafer 800% 档时
        // 连续两轮、四五次盲猜没有进展,就是因为这里只报了
        // 「子进程失败(exit=1)」而真实原因(page.evaluate 的具体异常)在后面几行。
        // 保留完整消息;子进程的 stderr 本来就已经拼进来了,只是被这行截断。
        sample = {
          status: 'failed',
          error: error.message.split('\n')[0].slice(0, 300),
          errorDetail: error.message.slice(0, 4000),
        }
      }
      samples.push({ sampleIndex, ...sample })
      console.log(`[${scenario.id} ${sampleIndex}/${repeatCount}]`, JSON.stringify(sample))
    }
    const aggregation = aggregateSamples(samples)
    const result = {
      ...scenario,
      status: aggregation.completedSampleCount === repeatCount
        ? 'completed'
        : aggregation.completedSampleCount === 0 ? 'timeout' : 'partial',
      requestedSampleCount: repeatCount,
      ...aggregation,
    }
    results.scenarios.push(result)
    console.log(`[${scenario.id} aggregate]`, JSON.stringify(result.aggregate))
  }
  results.finishedAt = new Date().toISOString()
  await mkdir(resultsDir, { recursive: true })
  const outFile = path.join(resultsDir, `scale-s4-zoom-out-probe-${Date.now()}.json`)
  await writeFile(outFile, JSON.stringify(results, null, 2))
  console.log('结果已写入', outFile)
}
