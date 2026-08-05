/**
 * C3-leafer 视频 probe runner（真实浏览器实测）。
 *
 * 不起 dev server（3100 归别人）：vite 只用于把页面 entry 打包成 IIFE，
 * 一切资源（HTML / bundle / 视频文件）由 Playwright page.route 静态伺服。
 *
 * 用法：node packages/renderer-leafer/probes/run-video.mjs
 * 输出：终端打印 + probes/results/video-probe-<timestamp>.json
 */

import { chromium } from '@playwright/test'
import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')

// vite 不是任何可见包的直接依赖（pnpm 严格解析），直接在 .pnpm 里定位
const pnpmDir = path.join(repoRoot, 'node_modules/.pnpm')
const viteDirName = readdirSync(pnpmDir).find((dir) => dir.startsWith('vite@'))
if (viteDirName === undefined) throw new Error('node_modules/.pnpm 下找不到 vite')
const { build } = await import(
  pathToFileURL(path.join(pnpmDir, viteDirName, 'node_modules/vite/dist/node/index.js')).href
)

const distDir = path.join(here, '.dist')
const resultsDir = path.join(here, 'results')
const videoFile = path.join(repoRoot, 'demo-video', 'framewright-mvp-20260804.webm')

const HOST = 'http://probe.local'

const results = { steps: [], startedAt: new Date().toISOString() }
function record(step, data) {
  results.steps.push({ step, ...data })
  console.log(`[${step}]`, JSON.stringify(data))
}

// --- 1. 打包页面（vite 仅作 bundler，不起 server） ---
await build({
  root: path.join(here, 'browser'),
  logLevel: 'silent',
  build: {
    outDir: distDir,
    emptyOutDir: true,
    lib: { entry: 'video-page.ts', formats: ['iife'], name: 'FwProbe', fileName: () => 'probe.iife.js' },
    minify: false,
  },
})
const bundle = await readFile(path.join(distDir, 'probe.iife.js'), 'utf8')
const videoBytes = await readFile(videoFile)

// --- 2. Playwright + 静态伺服 ---
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1024, height: 1400 } })
page.on('pageerror', (error) => console.error('[pageerror]', error.message))

await page.route(`${HOST}/**`, (route) => {
  const url = new URL(route.request().url())
  if (url.pathname === '/') {
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body style="margin:0"><div id="view" style="width:960px;height:1300px"></div><script src="/probe.iife.js"></script></body></html>`,
    })
  }
  if (url.pathname === '/probe.iife.js') return route.fulfill({ contentType: 'text/javascript', body: bundle })
  if (url.pathname === '/video.webm') {
    // 多路并发用 query 区分 Resource key，字节相同。
    // 🔴 必须支持 Range：Chrome seek 到未缓冲位置会带 Range 头重发请求，
    //    首轮 probe 一律回全量 200，seek 行为失真（怀疑是 seek 失效的帮凶之一）
    const range = route.request().headers()['range']
    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range)
      if (match) {
        const start = Number(match[1])
        const end = match[2] ? Number(match[2]) : videoBytes.length - 1
        return route.fulfill({
          status: 206,
          contentType: 'video/webm',
          headers: {
            'Content-Range': `bytes ${start}-${end}/${videoBytes.length}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(end - start + 1),
          },
          body: videoBytes.subarray(start, end + 1),
        })
      }
    }
    return route.fulfill({
      contentType: 'video/webm',
      headers: { 'Accept-Ranges': 'bytes', 'Content-Length': String(videoBytes.length) },
      body: videoBytes,
    })
  }
  return route.abort()
})

await page.goto(HOST)
await page.waitForFunction(() => window.__probe !== undefined)

const evaluate = (fn, arg) => page.evaluate(fn, arg)

// --- 3. 单路播放全链路 ---
const url1 = `${HOST}/video.webm?i=1`
const id1 = await evaluate((url) => window.__probe.createNode(url, 20, 20, 480, 270), url1)
await page.waitForFunction((url) => window.__probe.sourceState(url).state === 'ready', url1, { timeout: 15000 })
const ready1 = await evaluate((url) => window.__probe.sourceState(url), url1)
record('单路-加载', { duration: ready1.duration, naturalSize: ready1.naturalSize })
// 诊断：paint 管线走到哪一步了（image ready? leafPaint.data? view 是 video 元素?）
record('诊断-加载后paint状态', await evaluate((id) => window.__probe.paintState(id), id1))

// 首帧真的画出来了（canvas 指纹非初始值且两帧可比）
const fp0 = await evaluate((id) => window.__probe.frameFingerprint(id), id1)
const quality0 = await evaluate((url) => window.__probe.videoQuality(url), url1)
await evaluate(() => window.__probe.renderStats(true)) // 清零合成计数，做区间统计

// 点播放（真实点击 → 真实命中路径）
const playPoint = await evaluate((id) => window.__probe.controlPoint(id, 'play'), id1)
await page.mouse.click(playPoint.x, playPoint.y)
await page.waitForFunction((url) => window.__probe.sourceState(url).playing === true, url1, { timeout: 5000 })
await page.waitForTimeout(1200)
const playing1 = await evaluate((url) => window.__probe.sourceState(url), url1)
const fp1 = await evaluate((id) => window.__probe.frameFingerprint(id), id1)
const quality1 = await evaluate((url) => window.__probe.videoQuality(url), url1)
const stats1 = await evaluate(() => window.__probe.renderStats(false))
record('单路-播放1.2s', {
  currentTime: playing1.currentTime,
  playing: playing1.playing,
  画面指纹变化: JSON.stringify(fp0) !== JSON.stringify(fp1),
  指纹: [fp0, fp1],
  解码帧数: [quality0?.totalVideoFrames ?? null, quality1?.totalVideoFrames ?? null],
  解码帧数上升: quality1 != null && quality0 != null && quality1.totalVideoFrames > quality0.totalVideoFrames,
  合成调用: stats1,
  paint状态: await evaluate((id) => window.__probe.paintState(id), id1),
})

// 点暂停
await page.mouse.click(playPoint.x, playPoint.y)
await page.waitForFunction((url) => window.__probe.sourceState(url).playing === false, url1, { timeout: 5000 })
const paused1 = await evaluate((url) => window.__probe.sourceState(url), url1)
await page.waitForTimeout(400)
const paused2 = await evaluate((url) => window.__probe.sourceState(url), url1)
record('单路-暂停', { '暂停时进度': paused1.currentTime, '400ms后进度': paused2.currentTime, '进度停住': paused1.currentTime === paused2.currentTime })

// 点进度条 50%（暂停态 seek，应补画一帧）
const progressPoint = await evaluate((id) => window.__probe.controlPoint(id, 'progress50'), id1)
await page.mouse.click(progressPoint.x, progressPoint.y)
// 立即/中途/稳定三次读数：抓「短暂 seek 成功又被重置」的瞬态
const seekAt0 = await evaluate((url) => window.__probe.sourceState(url).currentTime, url1)
await page.waitForTimeout(150)
const seekAt150 = await evaluate((url) => window.__probe.sourceState(url).currentTime, url1)
await page.waitForTimeout(150)
const seeked = await evaluate((url) => window.__probe.sourceState(url), url1)
const fp2 = await evaluate((id) => window.__probe.frameFingerprint(id), id1)
const diag = await evaluate(
  ({ id, x, y }) => window.__probe.diagnoseTap(id, x, y),
  { id: id1, x: progressPoint.x, y: progressPoint.y },
)
record('单路-点按seek到50%', {
  期望: paused1.duration / 2,
  实际: seeked.currentTime,
  瞬态序列: [seekAt0, seekAt150, seeked.currentTime],
  偏差秒: Math.abs(seeked.currentTime - paused1.duration / 2),
  指纹: [fp0, fp1, fp2],
  指纹在seek后变化: JSON.stringify(fp1) !== JSON.stringify(fp2),
})
record('诊断-进度点击', diag)
// 诊断：真实事件对象看到的坐标 + 视频元素生命周期事件（seek 序列 / 是否被重建）
record('诊断-TAP事件坐标', await evaluate(() => window.__tapDebug))
record('诊断-视频元素事件日志', await evaluate(() => window.__videoEvents))

// 强证据：seek 到 90%（该处画面与开头完全不同——录屏 21s 处已切渲染器且缩放 236%），
// 暂停态补画若真的用了新帧，指纹必须变；50% 处画面与开头几乎相同，指纹不变不能作为判据
const progress90Point = await evaluate((id) => window.__probe.controlPoint(id, 'progress90'), id1)
await page.mouse.click(progress90Point.x, progress90Point.y)
await page.waitForTimeout(400)
const seeked90 = await evaluate((url) => window.__probe.sourceState(url), url1)
const fp3 = await evaluate((id) => window.__probe.frameFingerprint(id), id1)
record('单路-点按seek到90%', {
  期望: paused1.duration * 0.9,
  实际: seeked90.currentTime,
  偏差秒: Math.abs(seeked90.currentTime - paused1.duration * 0.9),
  指纹在seek90后变化: JSON.stringify(fp2) !== JSON.stringify(fp3),
})

// 点音量 25%
const volumePoint = await evaluate((id) => window.__probe.controlPoint(id, 'volume25'), id1)
await page.mouse.click(volumePoint.x, volumePoint.y)
await page.waitForTimeout(200)
const volumed = await evaluate((url) => window.__probe.sourceState(url), url1)
record('单路-点按音量25%', { 实际音量: volumed.volume })

// --- 4. 多路并发：1 / 4 / 8 路同时播放，各采 3s FPS + 内存 ---
// 恢复播放（静音其余：音量不影响解码负载，但避免浏览器把多路音频混流成本算进来——如实记录这一点）
async function playAll(count) {
  for (let i = 0; i < count; i++) {
    const id = `probe-video-${i}`
    const point = await evaluate((id) => window.__probe.controlPoint(id, 'play'), id)
    await page.mouse.click(point.x, point.y)
  }
  await page.waitForTimeout(500)
}

async function pauseAll(count) {
  for (let i = 0; i < count; i++) {
    const url = `${HOST}/video.webm?i=${i + 1}`
    const state = await evaluate((u) => window.__probe.sourceState(u), url)
    if (state.playing) {
      const point = await evaluate((idx) => window.__probe.controlPoint(`probe-video-${idx}`, 'play'), i)
      await page.mouse.click(point.x, point.y)
    }
  }
  await page.waitForTimeout(300)
}

/** 证据采集：FPS + 内存 + 解码帧总数 + 区间内合成调用数（空转 rAF 不算数） */
async function sampleWithEvidence(count) {
  const urls = Array.from({ length: count }, (_, i) => `${HOST}/video.webm?i=${i + 1}`)
  const q0 = await evaluate((list) => list.map((u) => window.__probe.videoQuality(u)?.totalVideoFrames ?? null), urls)
  await evaluate(() => window.__probe.renderStats(true))
  const fps = await evaluate(() => window.__probe.sampleFps(3000))
  const q1 = await evaluate((list) => list.map((u) => window.__probe.videoQuality(u)?.totalVideoFrames ?? null), urls)
  const stats = await evaluate(() => window.__probe.renderStats(false))
  const decoded = q1.reduce((sum, v, i) => sum + (v != null && q0[i] != null ? v - q0[i] : 0), 0)
  return {
    ...fps,
    内存MB: await evaluate(() => window.__probe.memoryMB()),
    解码帧数_采样区间: decoded,
    视频帧合成调用_采样区间: stats.drawImageVideoCalls,
    合成调用总数_采样区间: stats.drawImageCalls,
  }
}

// 1 路采样前恢复播放——首轮 probe 的「1 路 60fps」采样时视频其实是暂停态（真·空转 rAF）
const stateBefore1 = await evaluate((u) => window.__probe.sourceState(u), url1)
if (!stateBefore1.playing) {
  const point = await evaluate((id) => window.__probe.controlPoint(id, 'play'), id1)
  await page.mouse.click(point.x, point.y)
  await page.waitForFunction((u) => window.__probe.sourceState(u).playing === true, url1, { timeout: 5000 })
}
const fps1 = await sampleWithEvidence(1)
record('并发-1路播放-FPS', fps1)
await pauseAll(1)

// 加到 4 路（3 个新节点平铺）
for (let i = 2; i <= 4; i++) {
  const url = `${HOST}/video.webm?i=${i}`
  const x = 20 + ((i - 1) % 2) * 500
  const y = 20 + Math.floor((i - 1) / 2) * 300
  await evaluate(({ url, x, y }) => window.__probe.createNode(url, x, y, 460, 260), { url, x, y })
  await page.waitForFunction((url) => window.__probe.sourceState(url).state === 'ready', url, { timeout: 15000 })
}
await playAll(4)
const fps4 = await sampleWithEvidence(4)
record('并发-4路播放-FPS', fps4)
await pauseAll(4)

// 加到 8 路（视图已加高到 1300，5~8 路在视图内）
for (let i = 5; i <= 8; i++) {
  const url = `${HOST}/video.webm?i=${i}`
  const x = 20 + ((i - 1) % 2) * 500
  const y = 20 + Math.floor((i - 1) / 2) * 300
  await evaluate(({ url, x, y }) => window.__probe.createNode(url, x, y, 460, 260), { url, x, y })
  await page.waitForFunction((url) => window.__probe.sourceState(url).state === 'ready', url, { timeout: 20000 })
}
await playAll(8)
const fps8 = await sampleWithEvidence(8)
record('并发-8路播放-FPS', fps8)
// 8 路下进度是否都在走（解码是否跟得上）
const urls = Array.from({ length: 8 }, (_, i) => `${HOST}/video.webm?i=${i + 1}`)
const progresses = await evaluate((list) => list.map((u) => window.__probe.sourceState(u).currentTime), urls)
record('并发-8路-各路进度', { progresses })

await browser.close()

await mkdir(resultsDir, { recursive: true })
const outFile = path.join(resultsDir, `video-probe-${Date.now()}.json`)
await writeFile(outFile, JSON.stringify(results, null, 2))
console.log('结果已写入', outFile)
