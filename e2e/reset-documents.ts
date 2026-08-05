import type { Page } from '@playwright/test'

/**
 * 清空画布列表。
 *
 * 为什么需要：首页同时承担「文档列表」和「demo 画布宿主」两件事，
 * 列表越长、demo 画布被推得越靠下 —— 依赖 demo 画布坐标的用例就会失败。
 *
 * `globalSetup` 只在**每次运行开始**重置数据库，解决不了**同一次运行内**的累积：
 * `document-autosave` / `document-navigation` / `generation-flow` 都会创建文档，
 * 它们跑完之后，后面用 demo 画布的用例（`host-interaction` / `viewport` /
 * `visibility` / `parity` / `geometry-baseline`）就开始受影响。
 *
 * 实测佐证：`host-interaction` 单独跑 8/8 全过，全量跑失败 5 条。
 *
 * ⚠️ 这是权宜之计。**根因是首页身兼二职** —— demo 画布不该住在文档列表页上。
 * 真正的修法是把 demo 画布挪到独立路由，那属于产品改动，已记进待办。
 */
export async function resetDocuments(page: Page): Promise<void> {
  await page.request
    .get('/api/documents')
    .then(async (res) => {
      if (!res.ok()) return []
      const body = (await res.json()) as unknown
      return Array.isArray(body) ? body : ((body as { documents?: unknown[] }).documents ?? [])
    })
    .then(async (docs) => {
      for (const doc of docs as { id?: string }[]) {
        if (doc?.id) await page.request.delete(`/api/documents/${encodeURIComponent(doc.id)}`)
      }
    })
}
