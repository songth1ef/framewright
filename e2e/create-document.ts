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
/**
 * 🔴 就绪类等待要给宽超时，理由和「把所有断言都调大」不是一回事。
 *
 * 这一句等的是**一次导航返回**，不是业务状态 —— 它慢不代表产品有问题，
 * 只代表这台机器此刻忙。Playwright 默认 5 秒是按空闲 CI 调的。
 *
 * 2026-08-07 实测：本机 load average 16（用户 Chrome 有标签页吃满一核）时，
 * minimap 用例连续多轮稳定失败；断言超时放宽到 30 秒后**代码零改动即通过**。
 * 当时我据「稳定复现」把它判成真回归 —— 那个判据在负载持续偏高时不成立，
 * 稳定只说明条件稳定，不说明代码有问题。
 *
 * 业务断言（选中集、几何、颜色）仍用默认 5 秒：那些超时了就是真的错了。
 */
const READINESS_TIMEOUT_MS = 30_000

export const DEFAULT_DOCUMENT_NAME = '未命名画布'

export async function createDocument(page: Page, name = DEFAULT_DOCUMENT_NAME): Promise<void> {
  page.once('dialog', (dialog) => {
    void dialog.accept(name)
  })
  await page.getByTestId('create-document').click()
  await expect(page).toHaveURL(/\/canvas\/[^/]+$/, { timeout: READINESS_TIMEOUT_MS })
}

/** 点新建但取消对话框 —— 断言「取消则不创建」。 */
export async function cancelCreateDocument(page: Page): Promise<void> {
  page.once('dialog', (dialog) => {
    void dialog.dismiss()
  })
  await page.getByTestId('create-document').click()
}
