import { expect, test } from '@playwright/test'

// D2-leafer 验收：点选与框选在真实浏览器里走 Leafer 命中探针（selector.getByPoint），
// 单测的桩环境覆盖不了真实 hit canvas。行为口径与 DOM 侧一致（host-interaction.spec.ts）。

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('renderer-switch').click()
  await expect(page.getByTestId('active-renderer')).toHaveText('LeaferJS')
})

test('Leafer 侧点选业务单元，host 选中集一致', async ({ page }) => {
  const canvas = await page.getByTestId('canvas-container').boundingBox()
  expect(canvas).not.toBeNull()

  // box-back 位于画布 (40,40,200,140)
  await page.mouse.click(canvas!.x + 50, canvas!.y + 50)
  await expect(page.getByTestId('selection')).toHaveText('box-back')

  // box-front 压在 box-back 之上，点重叠区命中最上层
  await page.mouse.click(canvas!.x + 130, canvas!.y + 110)
  await expect(page.getByTestId('selection')).toHaveText('box-front')
})

test('Leafer 侧框选按相交收集，点击空白清空选中', async ({ page }) => {
  const canvas = await page.getByTestId('canvas-container').boundingBox()
  expect(canvas).not.toBeNull()

  await page.mouse.move(canvas!.x + 25, canvas!.y + 25)
  await page.mouse.down()
  await page.mouse.move(canvas!.x + 110, canvas!.y + 90, { steps: 5 })
  await page.mouse.up()
  await expect(page.getByTestId('selection')).toHaveText('box-back')

  await page.mouse.click(canvas!.x + 780, canvas!.y + 20)
  await expect(page.getByTestId('selection-count')).toHaveText('0')
})

test('Leafer 侧 Shift 点击切换选中', async ({ page }) => {
  const canvas = await page.getByTestId('canvas-container').boundingBox()
  expect(canvas).not.toBeNull()

  await page.mouse.click(canvas!.x + 50, canvas!.y + 50)
  await expect(page.getByTestId('selection')).toHaveText('box-back')

  // Shift 点重叠区增选 box-front
  await page.keyboard.down('Shift')
  await page.mouse.click(canvas!.x + 130, canvas!.y + 110)
  await page.keyboard.up('Shift')
  await expect(page.getByTestId('selection-count')).toHaveText('2')

  // Shift 再点 box-back 非重叠区减选
  await page.keyboard.down('Shift')
  await page.mouse.click(canvas!.x + 50, canvas!.y + 50)
  await page.keyboard.up('Shift')
  await expect(page.getByTestId('selection')).toHaveText('box-front')
})
