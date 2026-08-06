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
// pan-zoom：常规平移+缩放巡览；zoom-out-fast：缩到 10% 再快速拖拽（最吃性能的一档）
const SEQUENCE = process.argv[5] ?? 'pan-zoom'
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

// ---- 操作序列 ----

/**
 * 读工具栏上的缩放百分比，用来**确认**真的到了目标档位，
 * 而不是靠「滚了 40 次应该够了」去猜 —— 猜错就录出一个档位不对的 GIF。
 * 工具栏没有专门的 testid，所以按文本形态匹配百分比。
 */
/**
 * 缩放 N 步 —— 点工具栏的「缩小 / 放大」按钮。
 *
 * 🔴 为什么不用滚轮：两条路都试过，都不行。
 * ① 裸滚轮是**平移**不是缩放（见 `viewport-interaction.ts` 的 `onWheel`：
 *    只有 `ctrlKey || metaKey` 才走 `zoomAtPoint`）。第一版脚本用裸滚轮，
 *    录出来画面确实在动、看着像缩放，其实只是平移 —— 差点当成缩放交了。
 * ② Playwright 的 `mouse.wheel()` **不带修饰键状态**：先 `keyboard.down('Control')`
 *    再 wheel 也没用；手工 `dispatchEvent` 一个带 `ctrlKey: true` 的 WheelEvent 同样没生效。
 *
 * 工具栏按钮有 `aria-label`，是这里最确定的入口 —— 不跟事件合成较劲。
 */
async function zoomBy(steps, direction) {
  const label = direction === 'out' ? '缩小' : '放大'
  const button = page.getByRole('button', { name: label })
  for (let i = 0; i < steps; i += 1) {
    await button.click()
    await page.waitForTimeout(45)
  }
}

/** 读工具栏显示的缩放比例，用来**确认**到了目标档位，而不是靠「点够次数应该到了」去猜。 */
async function readScale() {
  return page
    .getByLabel('当前缩放比例')
    .textContent()
    .then((t) => t?.trim() ?? '?')
    .catch(() => '?')
}

if (SEQUENCE === 'zoom-out-fast') {
  // 缩到 10% 再快速拖拽 —— 这是最吃性能的一档：
  // 视口内节点最多、连线最密，且快速拖拽让每帧都要重算裁剪集合。

  // 1. 缩小到 10%（下限）。
  await zoomBy(25, 'out')
  await page.waitForTimeout(1200)
  const reached = await readScale()
  console.log('缩放档位 =', reached)
  if (!/^(10|1[0-5])%$/.test(reached)) {
    console.warn(`⚠️ 没到 10% 档（当前 ${reached}），录出来的不是目标场景`)
  }

  // 2. 快速拖拽：步长大、间隔短，逼近真人「甩」画布的手感
  for (let round = 0; round < 3; round += 1) {
    const dirX = round % 2 === 0 ? -1 : 1
    await page.mouse.move(cx, cy)
    await page.mouse.down({ button: 'middle' })
    for (let i = 1; i <= 22; i += 1) {
      await page.mouse.move(cx + dirX * i * 34, cy + (round === 1 ? i * 18 : -i * 12))
      await page.waitForTimeout(12)
    }
    await page.mouse.up({ button: 'middle' })
    await page.waitForTimeout(260)
  }
  await page.waitForTimeout(700)

  await context.close()
  await browser.close()
  console.log('录制完成 →', OUT_DIR)
  process.exit(0)
}

// 1. 中键平移：横向扫过 (约 2.5s)
await page.mouse.move(cx, cy)
await page.mouse.down({ button: 'middle' })
for (let i = 1; i <= 30; i += 1) {
  await page.mouse.move(cx - i * 14, cy - i * 5)
  await page.waitForTimeout(28)
}
await page.mouse.up({ button: 'middle' })
await page.waitForTimeout(400)

// 2. 放大 (约 2s)
await zoomBy(10, 'in')
await page.waitForTimeout(500)

// 3. 放大状态下再平移 (约 2s)
await page.mouse.down({ button: 'middle' })
for (let i = 1; i <= 24; i += 1) {
  await page.mouse.move(cx + i * 12, cy + i * 6)
  await page.waitForTimeout(30)
}
await page.mouse.up({ button: 'middle' })
await page.waitForTimeout(400)

// 4. 缩小回全局视图 (约 2.5s)
await zoomBy(14, 'out')
await page.waitForTimeout(900)
console.log('结束档位 =', await readScale())

await context.close()
await browser.close()
console.log('录制完成 →', OUT_DIR)
