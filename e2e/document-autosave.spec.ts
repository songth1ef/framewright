import { expect, test, type Page } from '@playwright/test'

type Bounds = Record<string, { x: number; y: number; width: number; height: number }>

async function readBounds(page: Page): Promise<Bounds> {
  await page.waitForFunction(
    () => typeof (window as unknown as { __fwGetBounds?: unknown }).__fwGetBounds === 'function',
  )
  return page.evaluate(
    () => (window as unknown as { __fwGetBounds: () => Bounds }).__fwGetBounds(),
  )
}

test('编辑后自动保存节点树，刷新后仍可跨会话撤销', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('create-document').click()
  await expect(page).toHaveURL(/\/canvas\/[^/]+$/)
  await expect(page.getByTestId('canvas-host')).toHaveAttribute('data-history-ready', 'true')

  const node = page.locator('[data-fw-id="box-back"]')
  const box = await node.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + 20, box!.y + 20)
  await page.mouse.down()
  await page.mouse.move(box!.x + 50, box!.y + 45)
  await page.mouse.up()

  await expect(page.getByTestId('save-status')).toHaveText('保存中…')
  await expect(page.getByTestId('save-status')).toHaveText('已保存')
  await page.reload()
  await expect(page.getByTestId('canvas-host')).toHaveAttribute('data-history-ready', 'true')
  await expect.poll(async () => (await readBounds(page))['box-back']).toMatchObject({ x: 70, y: 65 })

  await page.locator('[data-fw-id="box-back"]').click({ position: { x: 20, y: 20 } })
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('save-status')).toHaveText('保存中…')
  await expect(page.getByTestId('save-status')).toHaveText('已保存')
  await page.reload()
  await expect(page.locator('[data-fw-id="box-back"]')).toHaveCount(0)

  await expect(page.getByTestId('canvas-host')).toHaveAttribute('data-history-ready', 'true')
  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-fw-id="box-back"]')).toHaveCount(1)
})

test('自动保存失败时显示错误，不静默吞掉', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('create-document').click()
  await expect(page).toHaveURL(/\/canvas\/[^/]+$/)
  await expect(page.getByTestId('canvas-host')).toHaveAttribute('data-history-ready', 'true')
  await page.route('**/api/documents/*', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"test"}' })
      return
    }
    await route.continue()
  })

  await page.locator('[data-fw-id="box-back"]').click({ position: { x: 20, y: 20 } })
  await page.keyboard.press('Delete')

  await expect(page.getByTestId('save-status')).toContainText('保存失败')
  await expect(page.getByTestId('save-status')).toHaveAttribute('role', 'alert')
})

test('防抖窗口内切页会立即 flush 最后一次编辑', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('create-document').click()
  await expect(page).toHaveURL(/\/canvas\/[^/]+$/)
  await expect(page.getByTestId('canvas-host')).toHaveAttribute('data-history-ready', 'true')
  const documentUrl = page.url()

  await page.locator('[data-fw-id="box-back"]').click({ position: { x: 20, y: 20 } })
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('save-status')).toHaveText('保存中…')
  await page.getByRole('link', { name: '返回画布列表' }).click()
  await expect(page).toHaveURL('/')

  await page.locator(`a[href="${new URL(documentUrl).pathname}"]`).click()
  await expect(page.locator('[data-fw-id="box-back"]')).toHaveCount(0)
})
