import { expect, test } from '@playwright/test'
import { createDocument } from './create-document'

test('新建画布后进入文档路由，并能从首页列表再次打开', async ({ page }) => {
  await page.goto('/')

  await createDocument(page)
  await expect(page.getByTestId('document-name')).toHaveText('未命名画布')

  const documentUrl = page.url()
  await page.getByRole('link', { name: '返回画布列表' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByTestId('document-list')).toContainText('未命名画布')

  await page.locator(`a[href="${new URL(documentUrl).pathname}"]`).click()
  await expect(page).toHaveURL(documentUrl)
  await expect(page.getByTestId('canvas-container')).toBeVisible()
})

test('不存在的 documentId 显示 404 与返回入口', async ({ page }) => {
  await page.goto(`/canvas/missing-${Date.now()}`)

  await expect(page.getByTestId('document-not-found')).toHaveText('画布不存在')
  await expect(page.getByRole('link', { name: '返回画布列表' })).toHaveAttribute('href', '/')
})
