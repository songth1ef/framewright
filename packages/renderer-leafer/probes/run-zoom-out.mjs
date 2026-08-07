/**
 * Leafer S4 缩小档基准。父进程逐档隔离，单档超过 120 秒会记录 timeout 后继续。
 * 不启动、不停止任何 dev server。
 */

import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { LEAFER_ZOOM_OUT_PROBE_WORKLOAD } from './probe-config.mjs'
import { describeMachine } from './probe-machine.mjs'
import { sampleProcessMemory, samplePageMetrics } from './probe-memory.mjs'
import { buildDragEvidence, buildPanEvidence } from './browser/scale-sampling.mjs'
import { aggregateSamples } from './browser/repeated-sampling.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const distDir = path.join(here, '.dist')
const bundleFile = path.join(distDir, 'scale-probe.iife.js')
// --out-dir 让统一基准写到 benchmarks/results（已 gitignore），不污染入库的定点取证数据。
const resultsDir = process.argv.find((arg) => arg.startsWith('--out-dir='))
  ?.slice('--out-dir='.length) ?? path.join(here, 'results')
const host = 'http://scale-probe.local'
const workload = LEAFER_ZOOM_OUT_PROBE_WORKLOAD
const memoryReason =
  'performance.memory 仅覆盖 JS heap，无法表示 Canvas 后备缓冲、Leafer 实例与 GPU 资源，故不采集。'
const caseId = process.argv.find((arg) => arg.startsWith('--case='))?.slice('--case='.length)
const requestedConnectionPattern = process.argv
  .find((arg) => arg.startsWith('--connection-pattern='))
  ?.slice('--connection-pattern='.length)
const supportedConnectionPatterns = new Set(['none', 'fanin', 'distributed', 'many-to-many'])
if (
  requestedConnectionPattern !== undefined &&
  !supportedConnectionPatterns.has(requestedConnectionPattern)
) {
  throw new Error(`--connection-pattern 不支持：${requestedConnectionPattern}`)
}
// --scenarios-file 让外部注入任意场景矩阵；形状与内置场景一致，浏览器侧无需改动。
const scenariosFileArg = process.argv.find((arg) => arg.startsWith('--scenarios-file='))
  ?.slice('--scenarios-file='.length)
const baseScenarios = scenariosFileArg === undefined
  ? workload.scenarios
  : JSON.parse(readFileSync(scenariosFileArg, 'utf8'))

const scenarios = baseScenarios.map((scenario) => requestedConnectionPattern === undefined
  ? scenario
  : { ...scenario, connectionPattern: requestedConnectionPattern })

function screenshotFingerprint(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

/**
 * 🔴 与 DOM 侧完全对称的图片下载采集。
 *
 * 此前只有 DOM 探针采这个,Leafer 探针一条都不采。后果是 2026-08-06 的基准里
 * 出现「DOM 首屏 5-6 秒 vs Leafer 10-85ms」的 60 倍差距,看上去像是 Leafer 碾压 ——
 * 实际上 DOM 侧在等 picsum 下载(实测其首字节 5.5~6.6 秒且与图片大小几乎无关),
 * 而 Leafer 侧**下没下我们根本不知道**,因为没有仪表。
 *
 * 仪表不对称造成的差距会被当成实现差距。这与本仓记过的
 * 「Leafer 那份 JSON 没有 workload 块,产物层面无法核对」是同一类问题。
 */
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
    build: {
      outDir: distDir,
      emptyOutDir: true,
      lib: { entry: 'scale-page.ts', formats: ['iife'], name: 'FwLeaferScaleProbe', fileName: () => 'scale-probe.iife.js' },
      minify: false,
    },
  })
}

async function runCase(id) {
  const scenario = scenarios.find((candidate) => candidate.id === id)
  if (scenario === undefined) throw new Error(`未知 S4 档位：${id}`)
  const bundle = await readFile(bundleFile, 'utf8')
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
          body: `<!doctype html><html><body style="margin:0"><div id="view" style="position:relative;width:${workload.viewport.viewWidth}px;height:${workload.viewport.viewHeight}px;overflow:hidden"></div><script src="/scale-probe.iife.js"></script></body></html>`,
        })
      }
      if (url.pathname === '/scale-probe.iife.js') {
        return route.fulfill({ contentType: 'text/javascript', body: bundle })
      }
      return route.abort()
    })

    console.log('S4_PHASE:load')
    await page.goto(host)
    await page.waitForFunction(() => window.__scaleProbe !== undefined)
    const browserName = await page.evaluate(() => navigator.userAgent)

    const browserCdp = await browser.newBrowserCDPSession()
    const pageCdp = await page.context().newCDPSession(page)
    // 挂载场景之前先采基线，只用「后 - 前」的差值。
    const memoryBaseline = await sampleProcessMemory(browserCdp)

    console.log('S4_PHASE:first-screen')
    const firstScreen = await page.evaluate((value) => window.__scaleProbe.mountScenario(value), scenario)

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

    const result = {
      ...scenario,
      status: 'completed',
      browser: browserName,
      firstScreen: { ...firstScreen, ...imageDownloads.snapshot() },
      drag: { ...dragSample, avgFps: dragSample.fps, workEvidence: dragEvidence },
      pan: { ...panSample, avgFps: panSample.fps, workEvidence: panEvidence },
      memory: {
        baseline: memoryBaseline,
        afterScenario: await sampleProcessMemory(browserCdp),
        pageMetrics: await samplePageMetrics(pageCdp),
      },
      memoryReason,
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
    // 子进程要能查到同一份场景表，否则 --case= 找不到外部注入的档位。
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
    probe: 'renderer-leafer-scale-s4-zoom-out',
    machine: describeMachine(),
    startedAt: new Date().toISOString(),
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
        sample = { status: 'failed', error: error.message.split('\n')[0].slice(0, 300) }
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
