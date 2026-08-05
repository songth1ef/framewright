import { expect, test } from '@playwright/test'
import { selectRenderer } from './renderer'

// D1-leafer 验收（renderer-contract §3.1 末端）：在 Leafer 侧做视口手势后立刻切换渲染器，
// viewport 必须与切换前一致——视口状态住在 host，渲染器只是它的投影。

test('Leafer 侧滚轮平移后立刻切换渲染器，viewport 与切换前一致', async ({ page }) => {
  await page.goto('/')
  const container = page.getByTestId('canvas-container')

  await selectRenderer(page, 'LeaferJS')
  await expect(page.getByTestId('active-renderer')).toHaveText('LeaferJS')

  await container.dispatchEvent('wheel', { deltaX: 20, deltaY: 30 })
  await expect(page.getByTestId('viewport-scale')).toHaveText('100%')

  await selectRenderer(page, 'HTML / DOM')
  await expect(page.getByTestId('active-renderer')).toHaveText('HTML / DOM')
  // host 的 viewport 若在 Leafer 侧丢失，这里 DOM 投影出的 translate 就不是手势结果
  await expect(container.locator('[data-fw-viewport]')).toHaveAttribute(
    'style',
    /translate\(-20px, -30px\) scale\(1\)/,
  )
})

test('Leafer 侧中键拖拽平移后切换渲染器，viewport 一致', async ({ page }) => {
  await page.goto('/')
  const container = page.getByTestId('canvas-container')

  await selectRenderer(page, 'LeaferJS')
  await expect(page.getByTestId('active-renderer')).toHaveText('LeaferJS')

  const box = await container.boundingBox()
  if (box === null) throw new Error('canvas-container 不可见')
  await page.mouse.move(box.x + 400, box.y + 225)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(box.x + 450, box.y + 255, { steps: 5 })
  await page.mouse.up({ button: 'middle' })

  await selectRenderer(page, 'HTML / DOM')
  await expect(page.getByTestId('active-renderer')).toHaveText('HTML / DOM')
  await expect(container.locator('[data-fw-viewport]')).toHaveAttribute(
    'style',
    /translate\(50px, 30px\) scale\(1\)/,
  )
})

test('Leafer 侧 Ctrl+滚轮锚点缩放后切换渲染器，缩放比例一致', async ({ page }) => {
  await page.goto('/')
  const container = page.getByTestId('canvas-container')

  await selectRenderer(page, 'LeaferJS')
  await expect(page.getByTestId('active-renderer')).toHaveText('LeaferJS')

  await container.dispatchEvent('wheel', {
    deltaY: -100,
    ctrlKey: true,
    clientX: 400,
    clientY: 225,
  })
  await expect(page.getByTestId('viewport-scale')).toHaveText('110%')

  await selectRenderer(page, 'HTML / DOM')
  await expect(page.getByTestId('active-renderer')).toHaveText('HTML / DOM')
  await expect(page.getByTestId('viewport-scale')).toHaveText('110%')
  await expect(container.locator('[data-fw-viewport]')).toHaveAttribute('style', /scale\(1\.1\)/)
})
