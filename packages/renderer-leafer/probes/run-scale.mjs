/**
 * Leafer S3 规模基准：1000 / 10000 节点，many-to-many 与无连线隔离档。
 * Playwright page.route 静态伺服，不启动、不停止任何 dev server。
 */

import { chromium } from '@playwright/test'
import { readdirSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { LEAFER_SCALE_PROBE_WORKLOAD } from './probe-config.mjs'
import { describeMachine } from './probe-machine.mjs'
import {
  buildDragEvidence,
  buildPanEvidence,
  buildZoomEvidence,
} from './browser/scale-sampling.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const distDir = path.join(here, '.dist')
const resultsDir = path.join(here, 'results')
const host = 'http://scale-probe.local'
const workload = LEAFER_SCALE_PROBE_WORKLOAD
const memoryReason =
  'performance.memory 仅覆盖 JS heap，无法表示 Canvas 后备缓冲与 GPU 资源；前几轮 1/4/8 路均给出 9.5MB，已证明不能作为本基准的 memory 指标。'

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
    lib: {
      entry: 'scale-page.ts',
      formats: ['iife'],
      name: 'FwLeaferScaleProbe',
      fileName: () => 'scale-probe.iife.js',
    },
    minify: false,
  },
})

const bundle = await readFile(path.join(distDir, 'scale-probe.iife.js'), 'utf8')
const results = {
  probe: 'renderer-leafer-scale-s3',
  machine: describeMachine(),
  startedAt: new Date().toISOString(),
  workload,
  memory: { value: null, reason: memoryReason },
  browser: null,
  scenarios: [],
}

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
        body: `<!doctype html><html><body style="margin:0"><div id="view" style="position:relative;width:${workload.viewport.viewWidth}px;height:${workload.viewport.viewHeight}px;overflow:hidden"></div><script src="/scale-probe.iife.js"></script></body></html>`,
      })
    }
    if (url.pathname === '/scale-probe.iife.js') {
      return route.fulfill({ contentType: 'text/javascript', body: bundle })
    }
    return route.abort()
  })

  await page.goto(host)
  await page.waitForFunction(() => window.__scaleProbe !== undefined)
  results.browser = await page.evaluate(() => navigator.userAgent)

  for (const scenarioWorkload of workload.scenarios) {
    const firstScreen = await page.evaluate(
      (value) => window.__scaleProbe.mountScenario(value),
      scenarioWorkload,
    )

    const dragStart = await page.evaluate(() => window.__scaleProbe.dragSnapshot())
    const dragSample = await page.evaluate(
      ({ ms, threshold }) => window.__scaleProbe.sampleDrag(ms, threshold),
      { ms: workload.sampleWindowMs, threshold: workload.longFrameThresholdMs },
    )
    const dragEnd = await page.evaluate(() => window.__scaleProbe.dragSnapshot())
    const dragEvidence = buildDragEvidence(dragStart, dragEnd)

    const zoomStart = await page.evaluate(() => window.__scaleProbe.zoomSnapshot())
    const zoomSample = await page.evaluate(
      ({ ms, threshold }) => window.__scaleProbe.sampleZoom(ms, threshold),
      { ms: workload.sampleWindowMs, threshold: workload.longFrameThresholdMs },
    )
    const zoomEnd = await page.evaluate(() => window.__scaleProbe.zoomSnapshot())
    const zoomEvidence = buildZoomEvidence(zoomStart, zoomEnd)

    const panStart = await page.evaluate(() => window.__scaleProbe.panSnapshot())
    const panSample = await page.evaluate(
      ({ ms, threshold }) => window.__scaleProbe.samplePan(ms, threshold),
      { ms: workload.sampleWindowMs, threshold: workload.longFrameThresholdMs },
    )
    const panEnd = await page.evaluate(() => window.__scaleProbe.panSnapshot())
    const panEvidence = buildPanEvidence(panStart, panEnd)

    const scenarioResult = {
      ...scenarioWorkload,
      firstScreen: { ...firstScreen, memory: null, memoryReason },
      drag: { ...dragSample, workEvidence: dragEvidence, memory: null, memoryReason },
      zoom: { ...zoomSample, workEvidence: zoomEvidence, memory: null, memoryReason },
      pan: { ...panSample, workEvidence: panEvidence, memory: null, memoryReason },
    }
    results.scenarios.push(scenarioResult)
    console.log(`[${scenarioWorkload.id}]`, JSON.stringify(scenarioResult))
  }
} finally {
  await browser.close()
}

results.finishedAt = new Date().toISOString()
await mkdir(resultsDir, { recursive: true })
const outFile = path.join(resultsDir, `scale-s3-probe-${Date.now()}.json`)
await writeFile(outFile, JSON.stringify(results, null, 2))
console.log('结果已写入', outFile)
