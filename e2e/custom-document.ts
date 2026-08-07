import { expect, type Page } from '@playwright/test'
import type { FrameNode } from '../packages/core/src/index'
import { createDocumentStore } from '../packages/server-core/src/document-store'
import { createPrismaClient } from '../packages/server-core/src/prisma'
import { createDocument } from './create-document'
import { E2E_DATABASE_URL } from './global-setup'
import { resetDocuments } from './reset-documents'

/**
 * 先走真实的新建画布流程，再用 API 换入测试夹具。
 *
 * 这样既覆盖了 prompt 对话框，也不依赖 demo 文档的节点布局；每条用例还会先清空
 * 文档列表，避免首页的列表高度影响画布尺寸。
 */
export async function openCustomDocument(
  page: Page,
  root: FrameNode,
  name = 'e2e 自定义画布',
  storage: 'api' | 'fixture' = 'api',
): Promise<void> {
  await resetDocuments(page)
  await page.goto('/')
  await createDocument(page, name)

  const documentId = new URL(page.url()).pathname.split('/').at(-1)
  if (documentId === undefined || documentId === '') throw new Error('无法从画布 URL 读取 documentId')

  if (storage === 'api') {
    const response = await page.request.put(`/api/documents/${encodeURIComponent(documentId)}`, {
      data: { name, root, historySeq: 0 },
    })
    expect(response.ok()).toBe(true)
  } else {
    // audio 暂未进入 HTTP 导入校验；本用例只测 minimap，直接写 e2e 专用库隔离该无关边界。
    const prisma = createPrismaClient(E2E_DATABASE_URL)
    try {
      await createDocumentStore(prisma).saveDocument(documentId, { name, root, historySeq: 0 })
    } finally {
      await prisma.$disconnect()
    }
  }
  await page.reload()
  // 等的是一次 history fetch 返回（首次还含 Route Handler 冷编译），不是业务状态。
  // 理由与超时取值见 create-document.ts 的 READINESS_TIMEOUT_MS 注释。
  await expect(page.getByTestId('canvas-host'))
    .toHaveAttribute('data-history-ready', 'true', { timeout: 30_000 })
}
