/**
 * G5-1 DOM 视频 probe runner（真实 Chromium 实测）。
 *
 * 不起 dev server：Vite 只把浏览器 entry 打包成 IIFE，HTML、bundle 与视频
 * 都由 Playwright page.route 静态伺服。
 *
 * 准备素材：把 webm 放到 probes/fixtures/video.webm（该目录已 gitignore）。
 * 运行：node packages/renderer-dom/probes/run-video.mjs
 */

import { chromium } from '@playwright/test'
import { existsSync, readdirSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { assertPlaybackStarted, buildWorkEvidence } from './browser/sampling.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const distDir = path.join(here, '.dist')
const resultsDir = path.join(here, 'results')
const videoFile = path.join(here, 'fixtures', 'video.webm')
const host = 'http://probe.local'

if (!existsSync(videoFile)) {
  throw new Error(`缺少探针素材：${videoFile}`)
}

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
    lib: { entry: 'video-page.ts', formats: ['iife'], name: 'FwDomProbe', fileName: () => 'probe.iife.js' },
    minify: false,
  },
})

const [bundle, videoBytes] = await Promise.all([
  readFile(path.join(distDir, 'probe.iife.js'), 'utf8'),
  readFile(videoFile),
])

const results = {
  probe: 'renderer-dom-video',
  startedAt: new Date().toISOString(),
  workload: {
    renderer: 'DOM 原生 <video controls>',
    concurrency: [1, 4, 8],
    sampleWindowMs: 3000,
    nodeSize: { width: 460, height: 260 },
    viewport: { width: 1024, height: 700, viewWidth: 960, viewHeight: 600 },
    audio: '全部 muted；避免多路音频混流混入视频渲染对比',
    longFrameThresholdMs: 50,
  },
  memory: {
    value: null,
    reason: 'Chromium 页面 API 无法覆盖视频解码缓冲与 GPU 显存；performance.memory 仅是 JS heap，故不采集。',
  },
  browser: null,
  scenarios: [],
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 700 } })
  page.on('pageerror', (error) => console.error('[pageerror]', error.message))
  await page.route(`${host}/**`, (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/') {
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><body style="margin:0"><div id="view" style="position:relative;width:960px;height:600px;overflow:hidden"></div><script src="/probe.iife.js"></script></body></html>',
      })
    }
    if (url.pathname === '/probe.iife.js') {
      return route.fulfill({ contentType: 'text/javascript', body: bundle })
    }
    if (url.pathname === '/video.webm') {
      return route.fulfill({ contentType: 'video/webm', body: videoBytes })
    }
    return route.abort()
  })

  await page.goto(host)
  await page.waitForFunction(() => window.__probe !== undefined)
  results.browser = await page.evaluate(() => navigator.userAgent)

  for (const count of [1, 4, 8]) {
    await page.evaluate((value) => window.__probe.ensureVideos(value), count)
    await page.evaluate((value) => window.__probe.waitUntilReady(value), count)

    const beforePlay = await page.evaluate((value) => window.__probe.snapshot(value), count)
    await page.evaluate((value) => window.__probe.playAll(value), count)

    await page.waitForFunction(
      ({ value, baseline }) => {
        const current = window.__probe.snapshot(value)
        return current.every((item, index) => {
          const start = baseline[index]
          return start !== undefined && !item.paused && item.currentTime > start.currentTime && item.totalVideoFrames > start.totalVideoFrames
        })
      },
      { value: count, baseline: beforePlay },
      { timeout: 20_000 },
    )
    const afterPlay = await page.evaluate((value) => window.__probe.snapshot(value), count)
    assertPlaybackStarted(beforePlay, afterPlay)

    // 🔴 只有确认每一路已产生播放进度与解码帧之后，才在这里打开 3 秒采样窗口。
    const sampleStart = await page.evaluate((value) => window.__probe.snapshot(value), count)
    const fps = await page.evaluate((ms) => window.__probe.sampleFps(ms), 3000)
    const sampleEnd = await page.evaluate((value) => window.__probe.snapshot(value), count)
    const workEvidence = buildWorkEvidence(sampleStart, sampleEnd)

    const scenario = {
      concurrency: count,
      fps: fps.fps,
      frames: fps.frames,
      elapsedMs: fps.elapsedMs,
      longFrames: fps.longFrames,
      workEvidence,
      allProgressNonZero: workEvidence.every((item) => item.progressNonZero),
      allDecodedFramesIncreased: workEvidence.every((item) => item.decodedFramesIncreased),
      memory: null,
    }
    results.scenarios.push(scenario)
    console.log(`[并发-${count}路]`, JSON.stringify(scenario))

    await page.evaluate(() => window.__probe.pauseAll())
  }
} finally {
  await browser.close()
}

results.finishedAt = new Date().toISOString()
await mkdir(resultsDir, { recursive: true })
const outFile = path.join(resultsDir, `video-probe-${Date.now()}.json`)
await writeFile(outFile, JSON.stringify(results, null, 2))
console.log('结果已写入', outFile)
