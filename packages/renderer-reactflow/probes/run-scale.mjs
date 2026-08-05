import { chromium } from '@playwright/test'
import { readdirSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { REACT_FLOW_SCALE_WORKLOAD } from './probe-config.mjs'
import { compareMiniMap } from './browser/sampling.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const distDir = path.join(here, '.dist')
const resultsDir = path.join(here, 'results')
const host = 'http://react-flow-probe.local'
const workload = REACT_FLOW_SCALE_WORKLOAD

const viteDir = readdirSync(path.join(repoRoot, 'node_modules/.pnpm')).find((name) => name.startsWith('vite@'))
if (viteDir === undefined) throw new Error('找不到 vite')
const { build } = await import(pathToFileURL(path.join(repoRoot, 'node_modules/.pnpm', viteDir, 'node_modules/vite/dist/node/index.js')).href)
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

const [bundle, css] = await Promise.all([
  readFile(path.join(distDir, 'scale.iife.js'), 'utf8'),
  readFile(path.join(distDir, 'renderer-reactflow.css'), 'utf8'),
])
const results = { probe: 'renderer-reactflow-scale', startedAt: new Date().toISOString(), workload, browser: null, scenarios: [], miniMapComparisons: [] }
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: workload.viewport.width, height: workload.viewport.height } })
  page.on('pageerror', (error) => console.error('[pageerror]', error.message))
  await page.route(`${host}/**`, (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><link rel="stylesheet" href="/renderer-reactflow.css"></head><body style="margin:0"><div id="view" style="position:relative;width:${workload.viewport.viewWidth}px;height:${workload.viewport.viewHeight}px;overflow:hidden"></div><script src="/scale.iife.js"></script></body></html>` })
    if (pathname === '/scale.iife.js') return route.fulfill({ contentType: 'text/javascript', body: bundle })
    if (pathname === '/renderer-reactflow.css') return route.fulfill({ contentType: 'text/css', body: css })
    return route.abort()
  })
  await page.goto(host)
  await page.waitForFunction(() => window.__reactFlowScaleProbe !== undefined)
  results.browser = await page.evaluate(() => navigator.userAgent)

  const scenarios = [
    ...workload.scales.map((scale) => ({ scale, miniMap: false })),
    ...workload.miniMapScales.map((scale) => ({ scale, miniMap: true })),
  ]
  for (const scenario of scenarios) {
    const firstScreen = await page.evaluate((value) => window.__reactFlowScaleProbe.mount(value), scenario)
    const dragStart = await page.evaluate(() => window.__reactFlowScaleProbe.dragSnapshot())
    const drag = await page.evaluate(({ ms, threshold }) => window.__reactFlowScaleProbe.sampleDrag(ms, threshold), { ms: workload.sampleWindowMs, threshold: workload.longFrameThresholdMs })
    const dragEnd = await page.evaluate(() => window.__reactFlowScaleProbe.dragSnapshot())
    const panStart = await page.evaluate(() => window.__reactFlowScaleProbe.panSnapshot())
    const pan = await page.evaluate(({ ms, threshold }) => window.__reactFlowScaleProbe.samplePan(ms, threshold), { ms: workload.sampleWindowMs, threshold: workload.longFrameThresholdMs })
    const panEnd = await page.evaluate(() => window.__reactFlowScaleProbe.panSnapshot())
    const result = { ...scenario, firstScreen, drag: { ...drag, evidence: { start: dragStart, end: dragEnd } }, pan: { ...pan, evidence: { start: panStart, end: panEnd } } }
    results.scenarios.push(result)
    console.log(`[scale=${scenario.scale}, minimap=${scenario.miniMap}]`, JSON.stringify(result))
  }
  for (const scale of workload.miniMapScales) {
    const without = results.scenarios.find((item) => item.scale === scale && !item.miniMap)
    const withMap = results.scenarios.find((item) => item.scale === scale && item.miniMap)
    results.miniMapComparisons.push({
      scale,
      ...compareMiniMap(
        { renderMs: without.firstScreen.renderMs, dragFps: without.drag.fps, panFps: without.pan.fps },
        { renderMs: withMap.firstScreen.renderMs, dragFps: withMap.drag.fps, panFps: withMap.pan.fps },
      ),
    })
  }
} finally {
  await browser.close()
}

results.finishedAt = new Date().toISOString()
await mkdir(resultsDir, { recursive: true })
const file = path.join(resultsDir, `scale-probe-${Date.now()}.json`)
await writeFile(file, JSON.stringify(results, null, 2))
console.log('结果已写入', file)
