import { expect, test } from '@playwright/test'
import { selectRenderer } from './renderer'
import { resetDocuments } from './reset-documents'

test('Leafer 渲染器能在真实浏览器里挂载并报告全部节点的 bounds', async ({ page }) => {
  await resetDocuments(page)
  await page.goto('/')
  await selectRenderer(page, 'LeaferJS')
  await expect(page.getByTestId('active-renderer')).toHaveText('LeaferJS')

  const bounds = await page.evaluate(() =>
    (window as unknown as { __fwGetBounds: () => Record<string, unknown> }).__fwGetBounds(),
  )

  expect(Object.keys(bounds).sort()).toEqual(
    [
      'ai-image-1',
      'ai-video-1',
      'ai-video-2',
      'box-back',
      'box-front',
      'img-1',
      'inner-frame',
      'nested-box',
      'root',
      'video-1',
    ].sort(),
  )
  expect(bounds['nested-box']).toEqual({ x: 400, y: 80, width: 120, height: 80 })
})

test('Leafer 挂载后容器里出现 canvas 元素', async ({ page }) => {
  await page.goto('/')
  await selectRenderer(page, 'LeaferJS')
  await expect(page.getByTestId('canvas-container').locator('canvas')).toHaveCount(1)
})
