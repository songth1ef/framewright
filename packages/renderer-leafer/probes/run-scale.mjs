/**
 * Leafer S1/S2 规模探针（architecture.md §8.4）。Playwright page.route 静态伺服，
 * 不启动也不占用 dev server（3100 归别人）。
 *
 * 与 DOM 侧 run-scale.mjs 同流程：逐场景 首屏 → 拖拽采样 → 缩放采样，
 * 每步带「东西真的在变」证据，证据不成立直接抛错、不写结果。
 *
 * 运行：node packages/renderer-leafer/probes/run-scale.mjs
 * 输出：终端打印 + probes/results/scale-probe-<timestamp>.json
 */

import { chromium } from '@playwright/test'
import { readdirSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { LEAFER_SCALE_PROBE_WORKLOAD } from './probe-config.mjs'
import { buildDragEvidence, buildZoomEvidence } from './browser/scale-sampling.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const distDir = path.join(here, '.dist')
const resultsDir = path.join(here, 'results')
const host = 'http://scale-probe.local'
const workload = LEAFER_SCALE_PROBE_WORKLOAD

// vite 不是任何可见包的直接依赖（pnpm 严格解析），直接在 .pnpm 里定位
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

const bundle = await readFile(path.join(distDir, 'scale-probe.iife.js'), 'utf8')
const results = {
  probe: 'renderer-leafer-scale',
  startedAt: new Date().toISOString(),
  workload,
  memory: {
    value: null,
    reason: 'performance.memory 仅是 JS heap（视频基准已实测 1/4/8 路同为 9.5MB，无区分度），且无法覆盖 canvas 后备缓冲与 GPU 资源；宁可留空也不放看起来像数据的数字。',
  },
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
    // 证据不成立就抛在这里——宁可整轮失败，不写「看起来在动」的假数据
    const dragEvidence = buildDragEvidence(dragStart, dragEnd)

    const zoomStart = await page.evaluate(() => window.__scaleProbe.zoomSnapshot())
    const zoomSample = await page.evaluate(
      ({ ms, threshold }) => window.__scaleProbe.sampleZoom(ms, threshold),
      { ms: workload.sampleWindowMs, threshold: workload.longFrameThresholdMs },
    )
    const zoomEnd = await page.evaluate(() => window.__scaleProbe.zoomSnapshot())
    const zoomEvidence = buildZoomEvidence(zoomStart, zoomEnd)

    const scenarioResult = {
      ...scenarioWorkload,
      firstScreen: { ...firstScreen, memory: null },
      drag: { ...dragSample, workEvidence: dragEvidence, memory: null },
      zoom: { ...zoomSample, workEvidence: zoomEvidence, memory: null },
    }
    results.scenarios.push(scenarioResult)
    console.log(`[${scenarioWorkload.id}]`, JSON.stringify(scenarioResult))
  }
} finally {
  await browser.close()
}

results.finishedAt = new Date().toISOString()
await mkdir(resultsDir, { recursive: true })
const outFile = path.join(resultsDir, `scale-probe-${Date.now()}.json`)
await writeFile(outFile, JSON.stringify(results, null, 2))
console.log('结果已写入', outFile)
