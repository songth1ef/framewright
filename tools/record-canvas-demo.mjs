// 录制画布交互演示：切到 DOM 渲染器，做平移 + 缩放，输出 webm 供转 GIF。
//
// 为什么用 Playwright 而不是屏幕录制：需要确定性的操作序列，
// 每次录出来的动作完全一致，才能拿两个渲染器的视频做对照。
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const DOC_ID = process.argv[2] ?? 'cmsguasg00000p0lygh9e2s2z'
const RENDERER = process.argv[3] ?? 'HTML / DOM'
const OUT_DIR = resolve(process.argv[4] ?? 'tools/recordings')
const BASE = 'http://localhost:3100'

mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 720 } },
})
const page = await context.newPage()

const navStartedAt = Date.now()
await page.goto(`${BASE}/canvas/${DOC_ID}`, { waitUntil: 'networkidle' })

// 切到目标渲染器：按标签循环点，不写死点击次数 —— 默认渲染器变过一次，
// 写死次数的做法让十个 e2e 集体挂掉过。
const active = page.getByTestId('active-renderer')
const rendererSwitch = page.getByTestId('renderer-switch')
for (let i = 0; i < 4; i += 1) {
  const current = (await active.textContent())?.trim()
  if (current === RENDERER) break
  await rendererSwitch.click()
  await page.waitForTimeout(400)
}
console.log('renderer =', (await active.textContent())?.trim())

const canvas = page.getByTestId('canvas-container')
const box = await canvas.boundingBox()
if (!box) throw new Error('找不到画布容器')
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2

// 让素材解码完再开始，否则录到的是加载过程而不是交互性能。
await page.waitForTimeout(2500)

// 打点:录像从建 page 就开始了,加载 + 切换渲染器耗时不定。
// 打印动作起点,后续按这个时刻裁剪,保证 GIF 里全是交互、没有等待。
const actionStartMs = Date.now() - navStartedAt
console.log('ACTION_START_MS=', actionStartMs)

// ---- 操作序列（总时长约 10s）----

// 1. 中键平移：横向扫过 (约 2.5s)
await page.mouse.move(cx, cy)
await page.mouse.down({ button: 'middle' })
for (let i = 1; i <= 30; i += 1) {
  await page.mouse.move(cx - i * 14, cy - i * 5)
  await page.waitForTimeout(28)
}
await page.mouse.up({ button: 'middle' })
await page.waitForTimeout(400)

// 2. 滚轮放大 (约 2s)
for (let i = 0; i < 16; i += 1) {
  await page.mouse.wheel(0, -220)
  await page.waitForTimeout(90)
}
await page.waitForTimeout(500)

// 3. 放大状态下再平移 (约 2s)
await page.mouse.down({ button: 'middle' })
for (let i = 1; i <= 24; i += 1) {
  await page.mouse.move(cx + i * 12, cy + i * 6)
  await page.waitForTimeout(30)
}
await page.mouse.up({ button: 'middle' })
await page.waitForTimeout(400)

// 4. 滚轮缩小到全局视图 (约 2.5s)
for (let i = 0; i < 26; i += 1) {
  await page.mouse.wheel(0, 240)
  await page.waitForTimeout(80)
}
await page.waitForTimeout(900)

await context.close()
await browser.close()
console.log('录制完成 →', OUT_DIR)
