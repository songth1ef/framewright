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

test('工具栏显示最近一次业务节点动作', async ({ page }) => {
  await page.locator('[data-fw-id="ai-video-2"] button').click()
  await expect(page.getByTestId('last-node-action')).toHaveText('ai-video-2:retry')
})
