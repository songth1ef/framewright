/**
 * DOM LOD 缩略图尺寸成本探针。
 *
 * 变量：缩略图边长 [0（纯色）, 8, 16, 32, 64] px
 * 固定：1500 节点、12×8 显示尺寸、3 秒平移采样、长帧阈值 50 ms
 * 每档 5 次采样取中位数 + IQR；每次样本在独立子进程中跑，避免浏览器状态互相污染。
 *
 * 运行：node packages/renderer-dom/probes/run-lod-thumbnail.mjs --samples=2
 */

import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { aggregateSamples } from './browser/repeated-sampling.mjs'
import { buildDragEvidence, buildPanEvidence } from './browser/scale-sampling.mjs'
import { describeMachine } from './probe-machine.mjs'
import { samplePageMetrics, sampleProcessMemory } from './probe-memory.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const distDir = path.join(here, '.dist-lod-thumbnail')
const bundleFile = path.join(distDir, 'lod-thumbnail-probe.iife.js')
const resultsDir = process.argv.find((arg) => arg.startsWith('--out-dir='))
  ?.slice('--out-dir='.length) ?? path.join(here, 'results')
const host = 'http://lod-thumbnail-probe.local'

const workload = Object.freeze({
  renderer: 'DOM LOD 缩略图合成成本探针（纯色 / 内联 data URI 缩略图）',
  nodeCount: 1500,
  nodeSize: Object.freeze({ width: 12, height: 8 }),
  sampleWindowMs: 3000,
  longFrameThresholdMs: 50,
  repeatCount: 5,
  repeatCooldownMs: 1000,
  caseTimeoutMs: 120000,
  viewport: Object.freeze({ width: 1024, height: 1400, viewWidth: 960, viewHeight: 1300 }),
  viewportRole: 'browser viewport 1024×1400；可见画布 #view 960×1300',
  panDelta: Object.freeze({ x: -600, y: 0 }),
  dragDelta: Object.freeze({ x: 60, y: 40 }),
  seed: 7,
})

function buildScenario(id, label, thumbnailSize) {
  return Object.freeze({
    id,
    label,
    thumbnailSize,
    nodeCount: workload.nodeCount,
    nodeWidth: workload.nodeSize.width,
    nodeHeight: workload.nodeSize.height,
    sampleWindowMs: workload.sampleWindowMs,
    longFrameThresholdMs: workload.longFrameThresholdMs,
    panDelta: workload.panDelta,
    dragDelta: workload.dragDelta,
    seed: workload.seed,
  })
}

const scenarios = Object.freeze([
  buildScenario('thumb-0', '纯色（0px）', 0),
  buildScenario('thumb-8', '8×8 缩略图', 8),
  buildScenario('thumb-16', '16×16 缩略图', 16),
  buildScenario('thumb-32', '32×32 缩略图', 32),
  buildScenario('thumb-64', '64×64 缩略图', 64),
])

const workloadWithScenarios = Object.freeze({ ...workload, scenarios })

const caseId = process.argv.find((arg) => arg.startsWith('--case='))?.slice('--case='.length)

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

function screenshotFingerprint(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

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
      lib: {
        entry: 'lod-thumbnail-page.tsx',
        formats: ['iife'],
        name: 'FwDomLodThumbnailProbe',
        fileName: () => 'lod-thumbnail-probe.iife.js',
      },
      minify: false,
    },
  })
}

async function runCase(id) {
  const scenario = scenarios.find((candidate) => candidate.id === id)
  if (scenario === undefined) throw new Error(`未知缩略图档位：${id}`)

  const bundle = await readFile(bundleFile, 'utf8')
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({
      viewport: { width: workload.viewport.width, height: workload.viewport.height },
    })
    page.on('pageerror', (error) => console.error('[pageerror]', error.message))
    await page.route(`${host}/**`, (route) => {
      const url = new URL(route.request().url())
      if (url.pathname === '/') {
        return route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><html><body style="margin:0"><div id="view" style="position:relative;width:${workload.viewport.viewWidth}px;height:${workload.viewport.viewHeight}px;overflow:hidden"></div><script src="/lod-thumbnail-probe.iife.js"></script></body></html>`,
        })
      }
      if (url.pathname === '/lod-thumbnail-probe.iife.js') {
        return route.fulfill({ contentType: 'text/javascript', body: bundle })
      }
      return route.abort()
    })

    console.log('LOD_PHASE:load')
    await page.goto(host)
    await page.waitForFunction(() => window.__lodThumbnailProbe !== undefined)
    const browserName = await page.evaluate(() => navigator.userAgent)

    const browserCdp = await browser.newBrowserCDPSession()
    const pageCdp = await page.context().newCDPSession(page)
    const memoryBaseline = await sampleProcessMemory(browserCdp)

    console.log('LOD_PHASE:first-screen')
    const firstScreen = await page.evaluate(
      (value) => window.__lodThumbnailProbe.mountScenario(value),
      scenario,
    )
    const firstScreenFingerprint = screenshotFingerprint(await page.screenshot())

    console.log('LOD_PHASE:drag')
    await page.evaluate((value) => window.__lodThumbnailProbe.mountScenario(value), scenario)
    const dragStart = await page.evaluate(() => window.__lodThumbnailProbe.dragSnapshot())
    const dragSample = await page.evaluate(
      ({ ms, threshold }) => window.__lodThumbnailProbe.sampleDrag(ms, threshold),
      { ms: workload.sampleWindowMs, threshold: workload.longFrameThresholdMs },
    )
    const dragEnd = await page.evaluate(() => window.__lodThumbnailProbe.dragSnapshot())
    const dragEvidence = buildDragEvidence(dragStart, dragEnd)

    console.log('LOD_PHASE:pan')
    await page.evaluate((value) => window.__lodThumbnailProbe.mountScenario(value), scenario)
    const panStart = await page.evaluate(() => window.__lodThumbnailProbe.panSnapshot())
    const panStartFingerprint = screenshotFingerprint(await page.screenshot())
    const panSample = await page.evaluate(
      ({ ms, threshold, panDelta }) => window.__lodThumbnailProbe.samplePan(ms, threshold, panDelta),
      {
        ms: workload.sampleWindowMs,
        threshold: workload.longFrameThresholdMs,
        panDelta: workload.panDelta,
      },
    )
    const panEnd = await page.evaluate(() => window.__lodThumbnailProbe.panSnapshot())
    const panEndFingerprint = screenshotFingerprint(await page.screenshot())
    const panEvidence = {
      ...buildPanEvidence(panStart, panEnd),
      visual: {
        startFingerprint: panStartFingerprint,
        endFingerprint: panEndFingerprint,
        fingerprintChanged: panStartFingerprint !== panEndFingerprint,
      },
    }

    const memoryAfter = await sampleProcessMemory(browserCdp)
    const pageMetrics = await samplePageMetrics(pageCdp)

    const result = {
      ...scenario,
      status: 'completed',
      browser: browserName,
      firstScreen: {
        ...firstScreen,
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
    if (!panEvidence.visual.fingerprintChanged) {
      result.unverified = true
      result.unverifiedReason = '平移前后截图指纹未变化，该样本可能未真实渲染'
    }
    console.log(`LOD_RESULT:${JSON.stringify(result)}`)
  } finally {
    await browser.close()
  }
}

function runIsolatedCase(scenario) {
  return new Promise((resolve, reject) => {
    const childArgs = [fileURLToPath(import.meta.url), `--case=${scenario.id}`]
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
        if (line.startsWith('LOD_PHASE:')) lastPhase = line.slice('LOD_PHASE:'.length)
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
      const marker = stdout.split(/\r?\n/u).find((line) => line.startsWith('LOD_RESULT:'))
      if (code !== 0 || marker === undefined) {
        reject(new Error(`${scenario.id} 子进程失败（exit=${code}）：${stderr || stdout}`))
        return
      }
      resolve(JSON.parse(marker.slice('LOD_RESULT:'.length)))
    })
  })
}

if (caseId !== undefined) {
  await runCase(caseId)
} else {
  await buildBundle()
  const results = {
    probe: 'renderer-dom-lod-thumbnail',
    startedAt: new Date().toISOString(),
    machine: describeMachine(),
    workload: workloadWithScenarios,
    sampling: {
      repeatCount,
      repeatCooldownMs,
      isolation: '每次样本启动独立子进程，并新建 browser 与 page',
    },
    scenarios: [],
  }
  for (const scenario of scenarios) {
    const samples = []
    for (let sampleIndex = 1; sampleIndex <= repeatCount; sampleIndex += 1) {
      if (sampleIndex > 1 && repeatCooldownMs > 0) await coolDown(repeatCooldownMs)
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
  const outFile = path.join(resultsDir, `lod-thumbnail-probe-${Date.now()}.json`)
  await writeFile(outFile, JSON.stringify(results, null, 2))
  console.log('结果已写入', outFile)
}
