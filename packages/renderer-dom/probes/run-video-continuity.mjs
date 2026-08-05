/**
 * 视频播放连续性 probe：直接挂载 DOM / Leafer 两套生产 renderer，覆盖离屏裁剪与两档 LOD 往返。
 * 不启动、不停止任何 dev server，也不访问数据库。
 *
 * 运行：node packages/renderer-dom/probes/run-video-continuity.mjs
 */

import { chromium } from '@playwright/test'
import { readdirSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const distDir = path.join(here, '.dist')
const resultsDir = path.join(here, 'results')
const host = 'http://video-continuity-probe.local'

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
      entry: 'video-continuity-page.ts',
      formats: ['iife'],
      name: 'FwVideoContinuityProbe',
      fileName: () => 'video-continuity-probe.iife.js',
    },
    minify: false,
  },
})

const bundle = await readFile(path.join(distDir, 'video-continuity-probe.iife.js'), 'utf8')
const results = {
  probe: 'video-playback-continuity',
  startedAt: new Date().toISOString(),
  browser: null,
  scenarios: [],
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1_280, height: 720 } })
  page.on('pageerror', (error) => console.error('[pageerror]', error.message))
  await page.route(`${host}/**`, (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/') {
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><body style="margin:0"><div id="view" style="position:relative;width:1200px;height:640px;overflow:hidden"></div><script src="/probe.iife.js"></script></body></html>',
      })
    }
    if (pathname === '/probe.iife.js') {
      return route.fulfill({ contentType: 'text/javascript', body: bundle })
    }
    return route.abort()
  })

  await page.goto(host)
  await page.waitForFunction(() => window.__videoContinuityProbe !== undefined)
  results.browser = await page.evaluate(() => navigator.userAgent)

  for (const renderer of ['dom', 'leafer']) {
    for (const transition of ['culling', 'simplified', 'dot']) {
      const scenario = await page.evaluate(
        ({ rendererId, transitionId }) =>
          window.__videoContinuityProbe.runScenario(rendererId, transitionId),
        { rendererId: renderer, transitionId: transition },
      )
      results.scenarios.push(scenario)
      console.log(`[${renderer}/${transition}]`, JSON.stringify(scenario))
    }
  }
  await page.evaluate(() => window.__videoContinuityProbe.destroy())
} finally {
  await browser.close()
}

results.finishedAt = new Date().toISOString()
await mkdir(resultsDir, { recursive: true })
const outFile = path.join(resultsDir, `video-continuity-probe-${Date.now()}.json`)
await writeFile(outFile, JSON.stringify(results, null, 2))
console.log('结果已写入', outFile)
