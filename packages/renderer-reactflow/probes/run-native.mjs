import { chromium } from '@playwright/test'
import { readdirSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { REACT_FLOW_SCALE_WORKLOAD as workload } from './probe-config.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const distDir = path.join(here, '.dist')
const resultsDir = path.join(here, 'results')
const host = 'http://react-flow-native-probe.local'
const viteDir = readdirSync(path.join(repoRoot, 'node_modules/.pnpm')).find((name) => name.startsWith('vite@'))
if (viteDir === undefined) throw new Error('找不到 vite')
const { build } = await import(pathToFileURL(path.join(repoRoot, 'node_modules/.pnpm', viteDir, 'node_modules/vite/dist/node/index.js')).href)
await build({
  root: path.join(here, 'browser'),
  logLevel: 'silent',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: { outDir: distDir, emptyOutDir: true, lib: { entry: 'scale-page.ts', formats: ['iife'], name: 'FwReactFlowNativeProbe', fileName: () => 'native.iife.js' }, minify: false },
})
const [bundle, css] = await Promise.all([
  readFile(path.join(distDir, 'native.iife.js'), 'utf8'),
  readFile(path.join(distDir, 'renderer-reactflow.css'), 'utf8'),
])
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function animateMouse(page, from, to, ms, steps) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps
    await page.mouse.move(from.x + (to.x - from.x) * progress, from.y + (to.y - from.y) * progress)
    await delay(ms / steps)
  }
  await page.mouse.up()
}

const results = { probe: 'renderer-reactflow-native-interaction', startedAt: new Date().toISOString(), workload, browser: null, scenarios: [] }
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: workload.viewport.width, height: workload.viewport.height } })
  page.on('pageerror', (error) => console.error('[pageerror]', error.message))
  await page.route(`${host}/**`, (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><link rel="stylesheet" href="/renderer-reactflow.css"></head><body style="margin:0"><div id="view" style="position:relative;width:${workload.viewport.viewWidth}px;height:${workload.viewport.viewHeight}px;overflow:hidden"></div><script src="/native.iife.js"></script></body></html>` })
    if (pathname === '/native.iife.js') return route.fulfill({ contentType: 'text/javascript', body: bundle })
    if (pathname === '/renderer-reactflow.css') return route.fulfill({ contentType: 'text/css', body: css })
    return route.abort()
  })
  await page.goto(host)
  await page.waitForFunction(() => window.__reactFlowScaleProbe !== undefined)
  results.browser = await page.evaluate(() => navigator.userAgent)
  const requestedMiniMap = process.argv.find((arg) => arg.startsWith('--minimap='))?.split('=')[1]
  const miniMapCases = requestedMiniMap === undefined ? [false, true] : [requestedMiniMap === 'true']
  for (const miniMap of miniMapCases) {
    const firstScreen = await page.evaluate((value) => window.__reactFlowScaleProbe.mount(value), { scale: 0.1, miniMap })
    const beforeDrag = await page.evaluate(() => window.__reactFlowScaleProbe.domNodeSnapshot())
    const box = await page.locator(`[data-fw-id="${beforeDrag.fwId}"]`).boundingBox()
    if (box === null) throw new Error('证据节点没有 bounding box')
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await page.evaluate(() => window.__reactFlowScaleProbe.startFrameRecording())
    await animateMouse(page, from, { x: from.x + 120, y: from.y + 60 }, workload.sampleWindowMs, 2)
    const dragStats = await page.evaluate((threshold) => window.__reactFlowScaleProbe.stopFrameRecording(threshold), workload.longFrameThresholdMs)
    const afterDrag = await page.evaluate(() => window.__reactFlowScaleProbe.domNodeSnapshot())
    const drag = { ...dragStats, evidence: { before: beforeDrag, after: afterDrag, changed: beforeDrag.x !== afterDrag.x || beforeDrag.y !== afterDrag.y } }

    const panFrom = await page.evaluate(() => window.__reactFlowScaleProbe.panePoint())
    const beforePan = await page.evaluate(() => window.__reactFlowScaleProbe.panSnapshot())
    await page.evaluate(() => window.__reactFlowScaleProbe.startFrameRecording())
    // 高频真实事件两次均在 180 秒内无法完成；用 2 步确认单次交互代价并保留阻断事实。
    await animateMouse(page, panFrom, { x: panFrom.x + 200, y: panFrom.y + 100 }, workload.sampleWindowMs, 2)
    const panStats = await page.evaluate((threshold) => window.__reactFlowScaleProbe.stopFrameRecording(threshold), workload.longFrameThresholdMs)
    const afterPan = await page.evaluate(() => window.__reactFlowScaleProbe.panSnapshot())
    const pan = { ...panStats, evidence: { before: beforePan, after: afterPan, changed: beforePan.offsetX !== afterPan.offsetX || beforePan.offsetY !== afterPan.offsetY } }
    if (!drag.evidence.changed || !pan.evidence.changed) throw new Error(`原生交互证据未变化：${JSON.stringify({ drag, pan })}`)
    const scenario = { scale: 0.1, miniMap, firstScreen, drag, pan }
    results.scenarios.push(scenario)
    console.log(`[native, minimap=${miniMap}]`, JSON.stringify(scenario))
  }
} finally {
  await browser.close()
}
results.finishedAt = new Date().toISOString()
await mkdir(resultsDir, { recursive: true })
const file = path.join(resultsDir, `native-probe-${Date.now()}.json`)
await writeFile(file, JSON.stringify(results, null, 2))
console.log('结果已写入', file)
