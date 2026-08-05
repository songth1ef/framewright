import { chromium } from '@playwright/test'
import { existsSync, readdirSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { REACT_FLOW_VIDEO_WORKLOAD as workload } from './probe-config.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const distDir = path.join(here, '.dist')
const resultsDir = path.join(here, 'results')
const videoFile = path.join(repoRoot, 'packages/renderer-dom/probes/fixtures/video.webm')
const host = 'http://react-flow-video-probe.local'
if (!existsSync(videoFile)) throw new Error(`缺少 video fixture：${videoFile}`)
const viteDir = readdirSync(path.join(repoRoot, 'node_modules/.pnpm')).find((name) => name.startsWith('vite@'))
if (viteDir === undefined) throw new Error('找不到 vite')
const { build } = await import(pathToFileURL(path.join(repoRoot, 'node_modules/.pnpm', viteDir, 'node_modules/vite/dist/node/index.js')).href)
await build({
  root: path.join(here, 'browser'),
  logLevel: 'silent',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: { outDir: distDir, emptyOutDir: true, lib: { entry: 'video-page.ts', formats: ['iife'], name: 'FwReactFlowVideoProbe', fileName: () => 'video.iife.js' }, minify: false },
})
const [bundle, css, videoBytes] = await Promise.all([
  readFile(path.join(distDir, 'video.iife.js'), 'utf8'),
  readFile(path.join(distDir, 'renderer-reactflow.css'), 'utf8'),
  readFile(videoFile),
])
const results = { probe: 'renderer-reactflow-video', startedAt: new Date().toISOString(), workload, browser: null, scenarios: [], cullingReset: null, memory: null, memoryReason: '页面 API 无法覆盖视频解码缓冲与 GPU 显存，performance.memory 仅为部分 JS heap，故不采集。' }
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: workload.viewport.width, height: workload.viewport.height } })
  page.on('pageerror', (error) => console.error('[pageerror]', error.message))
  await page.route(`${host}/**`, (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><link rel="stylesheet" href="/renderer-reactflow.css"></head><body style="margin:0"><div id="view" style="position:relative;width:${workload.viewport.viewWidth}px;height:${workload.viewport.viewHeight}px;overflow:hidden"></div><script src="/video.iife.js"></script></body></html>` })
    if (pathname === '/video.iife.js') return route.fulfill({ contentType: 'text/javascript', body: bundle })
    if (pathname === '/renderer-reactflow.css') return route.fulfill({ contentType: 'text/css', body: css })
    if (pathname === '/video.webm') return route.fulfill({ contentType: 'video/webm', body: videoBytes })
    return route.abort()
  })
  await page.goto(host)
  await page.waitForFunction(() => window.__reactFlowVideoProbe !== undefined)
  results.browser = await page.evaluate(() => navigator.userAgent)
  for (const count of workload.concurrency) {
    const firstScreen = await page.evaluate((value) => window.__reactFlowVideoProbe.mount(value), count)
    await page.evaluate(() => window.__reactFlowVideoProbe.playAll())
    await page.evaluate(() => window.__reactFlowVideoProbe.waitForProgress())
    const before = await page.evaluate(() => window.__reactFlowVideoProbe.snapshot())
    const fps = await page.evaluate(({ ms, threshold }) => window.__reactFlowVideoProbe.sampleFps(ms, threshold), { ms: workload.sampleWindowMs, threshold: workload.longFrameThresholdMs })
    const after = await page.evaluate(() => window.__reactFlowVideoProbe.snapshot())
    const workEvidence = after.map((item, index) => ({
      fwId: item.fwId,
      progressDeltaSeconds: item.currentTime - before[index].currentTime,
      decodedFramesDelta: item.totalVideoFrames - before[index].totalVideoFrames,
      droppedFramesDelta: item.droppedVideoFrames - before[index].droppedVideoFrames,
    }))
    if (workEvidence.some((item) => item.progressDeltaSeconds <= 0 || item.decodedFramesDelta <= 0)) throw new Error(`播放证据不足：${JSON.stringify(workEvidence)}`)
    const scenario = { concurrency: count, firstScreen, fps, workEvidence }
    results.scenarios.push(scenario)
    console.log(`[video=${count}]`, JSON.stringify(scenario))
  }
  results.cullingReset = await page.evaluate(() => window.__reactFlowVideoProbe.measureCullingReset())
  console.log('[culling-reset]', JSON.stringify(results.cullingReset))
} finally {
  await browser.close()
}
results.finishedAt = new Date().toISOString()
await mkdir(resultsDir, { recursive: true })
const file = path.join(resultsDir, `video-probe-${Date.now()}.json`)
await writeFile(file, JSON.stringify(results, null, 2))
console.log('结果已写入', file)
