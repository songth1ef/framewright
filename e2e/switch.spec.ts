import { expect, test } from '@playwright/test'

test('切换渲染器后选中态保留', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('select-box-back').click()
  await expect(page.getByTestId('selection')).toHaveText('box-back')

  await page.getByTestId('renderer-switch').click()
  await expect(page.getByTestId('active-renderer')).toHaveText('LeaferJS')

  // 选中态住在 host 不在渲染器，切换不该丢
  await expect(page.getByTestId('selection')).toHaveText('box-back')
})

test('切换后旧渲染器的 DOM 被清干净，容器里只剩新渲染器的产物', async ({ page }) => {
  await page.goto('/')
  const container = page.getByTestId('canvas-container')

  // DOM 渲染器：有带 data-fw-id 的元素，无 canvas
  await expect(container.locator('[data-fw-id]').first()).toBeVisible()
  await expect(container.locator('canvas')).toHaveCount(0)

  await page.getByTestId('renderer-switch').click()
  await expect(page.getByTestId('active-renderer')).toHaveText('LeaferJS')

  // Leafer 渲染器：有 canvas，DOM 渲染器留下的元素必须一个不剩
  await expect(container.locator('canvas')).toHaveCount(1)
  await expect(container.locator('[data-fw-id]')).toHaveCount(0)
})

test('切回 DOM 渲染器后 canvas 被清干净', async ({ page }) => {
  await page.goto('/')
  const container = page.getByTestId('canvas-container')

  await page.getByTestId('renderer-switch').click()
  await expect(container.locator('canvas')).toHaveCount(1)

  await page.getByTestId('renderer-switch').click()
  await expect(page.getByTestId('active-renderer')).toHaveText('HTML / DOM')
  await expect(container.locator('canvas')).toHaveCount(0)
  await expect(container.locator('[data-fw-id]').first()).toBeVisible()
})
