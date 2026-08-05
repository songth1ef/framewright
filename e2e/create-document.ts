import { expect, type Page } from '@playwright/test'

/**
 * 从首页新建一张画布并等它进入画布路由。
 *
 * 为什么需要这个 helper：新建流程改成了「先询问名称」（`document-list.tsx` 用
 * `window.prompt('给新画布命名', '未命名画布')`），而原先各 spec 是
 * 「点 create-document → 直接断言跳转」。原生对话框没人接管时点击不会推进，
 * 于是页面停在首页 —— 6 条 e2e 因此失败。
 *
 * 🔴 抽成共享 helper 而不是在六个文件里各写一遍：新建流程再变时只改这一处。
 * 同理见 `renderer.ts` 的 `selectRenderer`。
 */
export const DEFAULT_DOCUMENT_NAME = '未命名画布'

export async function createDocument(page: Page, name = DEFAULT_DOCUMENT_NAME): Promise<void> {
  page.once('dialog', (dialog) => {
    void dialog.accept(name)
  })
  await page.getByTestId('create-document').click()
  await expect(page).toHaveURL(/\/canvas\/[^/]+$/)
}

/** 点新建但取消对话框 —— 断言「取消则不创建」。 */
export async function cancelCreateDocument(page: Page): Promise<void> {
  page.once('dialog', (dialog) => {
    void dialog.dismiss()
  })
  await page.getByTestId('create-document').click()
}
