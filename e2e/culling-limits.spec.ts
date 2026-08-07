import { expect, test, type Page } from '@playwright/test'
import { createBoxNode, createFrameNode } from '../packages/core/src/index'
import { openCustomDocument } from './custom-document'
import { selectRenderer, type RendererLabel } from './renderer'

// 2026-08-06 起所有设置收编进统一键。断言改为「统一设置里的预算」而不是
// 已废弃的独立键 —— 守的仍是「改了能生效、刷新后保持」这条不变量。
const STORAGE_KEY = 'framewright:settings'

function readStoredLimits(page: import('@playwright/test').Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as { performance?: { maxNodes?: number; maxConnections?: number } }
    return {
      maxNodes: parsed.performance?.maxNodes ?? null,
      maxConnections: parsed.performance?.maxConnections ?? null,
    }
  }, STORAGE_KEY)
}
const BOX_COLORS = ['#ef4444', '#22c55e', '#3b82f6', '#eab308'] as const

function createCullingFixture() {
  return createFrameNode({
    fwId: 'root',
    name: '裁剪预算夹具',
    width: 800,
    height: 450,
    background: '#ffffff',
    children: BOX_COLORS.map((fill, index) =>
      createBoxNode({
        fwId: `budget-box-${index}`,
        name: `预算方块 ${index}`,
        x: 300 + (index % 2) * 120,
        y: 160 + Math.floor(index / 2) * 100,
        width: 80,
        height: 60,
        fill,
      }),
    ),
  })
}

async function openDevPanel(page: Page): Promise<void> {
  if (await page.getByTestId('dev-panel-toggle').isVisible()) {
    await page.getByTestId('dev-panel-toggle').click()
  }
  await expect(page.getByTestId('dev-panel')).toBeVisible()
}

async function readLeaferRenderedBoxCount(page: Page): Promise<number> {
  return page.getByTestId('canvas-container').evaluate((container, expectedColors) => {
    const canvases = [...container.querySelectorAll('canvas')]
    const normalized = new Set(expectedColors.map((color) => color.toLowerCase()))
    const found = new Set<string>()

    for (const canvas of canvases) {
      const context = canvas.getContext('2d')
      if (context === null || canvas.width === 0 || canvas.height === 0) continue
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] === 0) continue
        const color = `#${[pixels[index], pixels[index + 1], pixels[index + 2]]
          .map((channel) => channel!.toString(16).padStart(2, '0'))
          .join('')}`
        if (normalized.has(color)) found.add(color)
      }
    }
    return found.size
  }, BOX_COLORS)
}

async function readRenderedNodeCount(page: Page, renderer: RendererLabel): Promise<number> {
  if (renderer === 'HTML / DOM') {
    return page.getByTestId('canvas-container').locator('[data-fw-id]').count()
  }
  // Leafer 没有逐节点 DOM；读取四个测试专属纯色是否真正进入 Canvas 像素。
  return 1 + await readLeaferRenderedBoxCount(page)
}

for (const renderer of ['HTML / DOM', 'LeaferJS'] as const) {
  test(`${renderer} 修改节点裁剪预算后实际挂载数变化，刷新后仍保持`, async ({ page }) => {
    await openCustomDocument(page, createCullingFixture())
    await selectRenderer(page, renderer)
    await openDevPanel(page)

    const maxNodes = page.getByTestId('max-nodes-input')
    await maxNodes.fill('1')
    await expect.poll(() => readRenderedNodeCount(page, renderer)).toBe(1)

    await maxNodes.fill('3')
    await expect.poll(() => readRenderedNodeCount(page, renderer)).toBe(3)
    await expect(readStoredLimits(page)).resolves.toEqual({ maxNodes: 3, maxConnections: 1000 })

    await page.reload()
    // 渲染器选择不跨刷新保持，必须按标签重新选择。
    await selectRenderer(page, renderer)
    await openDevPanel(page)
    await expect(page.getByTestId('max-nodes-input')).toHaveValue('3')
    await expect.poll(() => readRenderedNodeCount(page, renderer)).toBe(3)
  })
}

test('裁剪预算接受上下边界，拒绝非法输入并让坏存储回退缺省值', async ({ page }) => {
  await openCustomDocument(page, createCullingFixture())
  await selectRenderer(page, 'HTML / DOM')
  await openDevPanel(page)

  const maxNodes = page.getByTestId('max-nodes-input')
  const maxConnections = page.getByTestId('max-connections-input')
  await expect(maxNodes).toHaveAttribute('min', '1')
  await expect(maxNodes).toHaveAttribute('max', '100000')
  await expect(maxConnections).toHaveAttribute('min', '0')
  await expect(maxConnections).toHaveAttribute('max', '100000')

  await maxNodes.fill('100000')
  await maxConnections.fill('0')
  await expect(maxNodes).toHaveValue('100000')
  await expect(maxConnections).toHaveValue('0')

  await maxNodes.fill('0')
  await maxConnections.fill('-1')
  await expect(maxNodes).toHaveValue('100000')
  await expect(maxConnections).toHaveValue('0')

  // 坏存储：非法档案应整体回退默认，而不是把画布带进无法解释的状态
  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({ performance: { maxNodes: 1.5, maxConnections: 100001 } }))
  }, STORAGE_KEY)
  await page.reload()
  await selectRenderer(page, 'HTML / DOM')
  await openDevPanel(page)
  await expect(page.getByTestId('max-nodes-input')).toHaveValue('1500')
  await expect(page.getByTestId('max-connections-input')).toHaveValue('1000')
  await expect(readStoredLimits(page)).resolves.toEqual({ maxNodes: 1500, maxConnections: 1000 })
})
