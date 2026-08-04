import { expect, test } from '@playwright/test'

test('host 接收 DOM viewport 上报并显示当前缩放比例', async ({ page }) => {
  await page.goto('/')
  const container = page.getByTestId('canvas-container')
  const viewportLayer = container.locator('[data-fw-viewport]')

  await expect(page.getByTestId('viewport-scale')).toHaveText('100%')
  await container.dispatchEvent('wheel', {
    deltaY: -100,
    ctrlKey: true,
    clientX: 400,
    clientY: 225,
  })

  await expect(page.getByTestId('viewport-scale')).toHaveText('110%')
  await expect(viewportLayer).toHaveAttribute('style', /scale\(1\.1\)/)
})

test('普通滚轮只平移，切换渲染器后 viewport 会话状态保留', async ({ page }) => {
  await page.goto('/')
  const container = page.getByTestId('canvas-container')
  const viewportLayer = container.locator('[data-fw-viewport]')

  await container.dispatchEvent('wheel', { deltaX: 20, deltaY: 30 })
  await expect(page.getByTestId('viewport-scale')).toHaveText('100%')
  await expect(viewportLayer).toHaveAttribute('style', /translate\(-20px, -30px\) scale\(1\)/)

  await page.getByTestId('renderer-switch').click()
  await expect(page.getByTestId('active-renderer')).toHaveText('LeaferJS')
  await expect(page.getByTestId('viewport-scale')).toHaveText('100%')

  await page.getByTestId('renderer-switch').click()
  await expect(page.getByTestId('active-renderer')).toHaveText('HTML / DOM')
  await expect(container.locator('[data-fw-viewport]')).toHaveAttribute(
    'style',
    /translate\(-20px, -30px\) scale\(1\)/,
  )
})
