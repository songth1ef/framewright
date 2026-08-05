import { expect, test, type Page } from '@playwright/test'

type Bounds = Record<string, { x: number; y: number; width: number; height: number }>

async function readBounds(page: Page): Promise<Bounds> {
  return page.evaluate(
    () => (window as unknown as { __fwGetBounds: () => Bounds }).__fwGetBounds(),
  )
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('active-renderer')).toHaveText('HTML / DOM')
})

test('拖动节点松手后 host 写回 node 树，位置保持不弹回', async ({ page }) => {
  const node = page.locator('[data-fw-id="box-back"]')
  const box = await node.boundingBox()
  expect(box).not.toBeNull()

  await page.mouse.move(box!.x + 20, box!.y + 20)
  await page.mouse.down()
  await page.mouse.move(box!.x + 50, box!.y + 45)
  await page.mouse.up()

  await expect.poll(async () => (await readBounds(page))['box-back']).toMatchObject({ x: 70, y: 65 })
  await page.getByTestId('renderer-switch').click()
  await page.getByTestId('renderer-switch').click()
  await expect.poll(async () => (await readBounds(page))['box-back']).toMatchObject({ x: 70, y: 65 })
})

test('框选后 host 用 applySelection 计算并显示最终选中集', async ({ page }) => {
  const canvas = await page.getByTestId('canvas-container').boundingBox()
  expect(canvas).not.toBeNull()

  await page.mouse.move(canvas!.x + 25, canvas!.y + 25)
  await page.mouse.down()
  await page.mouse.move(canvas!.x + 110, canvas!.y + 90)
  await page.mouse.up()

  await expect(page.getByTestId('selection')).toHaveText('box-back')
  await expect(page.getByTestId('selection-count')).toHaveText('1')
})

test('Delete 删除节点后节点与溯源连线一起消失', async ({ page }) => {
  const canvas = page.getByTestId('canvas-container')
  await expect(canvas.locator('[data-fw-connection-from="ai-image-1"]')).toHaveCount(2)

  await canvas.locator('[data-fw-id="ai-image-1"]').click({ position: { x: 20, y: 20 } })
  await expect(page.getByTestId('selection')).toHaveText('ai-image-1')
  await page.keyboard.press('Delete')

  await expect(canvas.locator('[data-fw-id="ai-image-1"]')).toHaveCount(0)
  await expect(canvas.locator('[data-fw-connection-from="ai-image-1"]')).toHaveCount(0)
  await expect(page.getByTestId('selection-count')).toHaveText('0')
})

test('拖动节点后 Ctrl+Z 恢复原位置，Ctrl+Shift+Z 重做移动', async ({ page }) => {
  const node = page.locator('[data-fw-id="box-back"]')
  const box = await node.boundingBox()
  expect(box).not.toBeNull()

  await page.mouse.move(box!.x + 20, box!.y + 20)
  await page.mouse.down()
  await page.mouse.move(box!.x + 50, box!.y + 45)
  await page.mouse.up()
  await expect.poll(async () => (await readBounds(page))['box-back']).toMatchObject({ x: 70, y: 65 })

  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await readBounds(page))['box-back']).toMatchObject({ x: 40, y: 40 })

  await page.keyboard.press('Control+Shift+z')
  await expect.poll(async () => (await readBounds(page))['box-back']).toMatchObject({ x: 70, y: 65 })
})

test('一次移动三个选中节点，Ctrl+Z 一次全部回退', async ({ page }) => {
  const canvas = await page.getByTestId('canvas-container').boundingBox()
  expect(canvas).not.toBeNull()

  await page.mouse.click(canvas!.x + 50, canvas!.y + 50)
  await page.keyboard.down('Shift')
  await page.mouse.click(canvas!.x + 130, canvas!.y + 110)
  await page.mouse.click(canvas!.x + 390, canvas!.y + 70)
  await page.keyboard.up('Shift')
  await expect(page.getByTestId('selection-count')).toHaveText('3')
  await expect(page.locator('[data-fw-selection-outline="group"]')).toBeVisible()

  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await readBounds(page))['box-back']).toMatchObject({ x: 41, y: 40 })
  await expect.poll(async () => (await readBounds(page))['box-front']).toMatchObject({ x: 121, y: 100 })
  await expect.poll(async () => (await readBounds(page))['inner-frame']).toMatchObject({ x: 381, y: 60 })

  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await readBounds(page))['box-back']).toMatchObject({ x: 40, y: 40 })
  await expect.poll(async () => (await readBounds(page))['box-front']).toMatchObject({ x: 120, y: 100 })
  await expect.poll(async () => (await readBounds(page))['inner-frame']).toMatchObject({ x: 380, y: 60 })
})

test('删除后 Ctrl+Z 同时恢复节点与溯源连线', async ({ page }) => {
  const canvas = page.getByTestId('canvas-container')
  await canvas.locator('[data-fw-id="ai-image-1"]').click({ position: { x: 20, y: 20 } })
  await page.keyboard.press('Delete')
  await expect(canvas.locator('[data-fw-id="ai-image-1"]')).toHaveCount(0)
  await expect(canvas.locator('[data-fw-connection-from="ai-image-1"]')).toHaveCount(0)

  await page.keyboard.press('Control+z')
  await expect(canvas.locator('[data-fw-id="ai-image-1"]')).toHaveCount(1)
  await expect(canvas.locator('[data-fw-connection-from="ai-image-1"]')).toHaveCount(2)
})

test('撤销后再操作会丢弃重做栈', async ({ page }) => {
  const node = page.locator('[data-fw-id="box-back"][data-fw-type="box"]')
  let box = await node.boundingBox()
  expect(box).not.toBeNull()

  await page.mouse.move(box!.x + 20, box!.y + 20)
  await page.mouse.down()
  await page.mouse.move(box!.x + 50, box!.y + 45)
  await page.mouse.up()
  await page.keyboard.press('Control+z')

  box = await node.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + 20, box!.y + 20)
  await page.mouse.down()
  await page.mouse.move(box!.x + 35, box!.y + 30)
  await page.mouse.up()
  await expect.poll(async () => (await readBounds(page))['box-back']).toMatchObject({ x: 55, y: 50 })

  await page.keyboard.press('Control+Shift+z')
  await expect.poll(async () => (await readBounds(page))['box-back']).toMatchObject({ x: 55, y: 50 })
})

test('工具栏显示最近一次业务节点动作', async ({ page }) => {
  // 卡片内主操作按钮（失败态的「重试」），不是 hover 业务工具条里的按钮。
  // 工具条按钮一律带 data-fw-interaction="ignore"，用它把两者区分开 ——
  // 否则 `[data-fw-id=...] button` 会同时命中两处，strict mode 直接报错。
  await page.locator('[data-fw-id="ai-video-2"] button:not([data-fw-interaction])').click()
  await expect(page.getByTestId('last-node-action')).toHaveText('ai-video-2:retry')
})
