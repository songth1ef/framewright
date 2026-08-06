import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

const repoRoot = path.dirname(fileURLToPath(import.meta.url))
const e2eDatabasePath = path.join(repoRoot, 'prisma', 'e2e.db')
const E2E_DATABASE_URL = `file:${e2eDatabasePath.replaceAll('\\', '/')}`
const e2ePort = process.env['FRAMEWRIGHT_E2E_PORT'] ?? '3100'
const e2eBaseUrl = `http://localhost:${e2ePort}`

export default defineConfig({
  testDir: './e2e',
  // e2e 共用同一个本地 SQLite；并行创建 Document 会互相争抢写锁。
  workers: 1,
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
  // 每轮开跑前把 e2e 专用库删干净重建，理由见 e2e/global-setup.ts 的注释。
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: e2eBaseUrl },
  webServer: {
    // 默认仍走 3100；本机已有开发服务时可换端口，仍由 Playwright 独占启动，绝不复用。
    command: `pnpm --filter @framewright/web exec next dev -p ${e2ePort}`,
    url: e2eBaseUrl,
    // 🔴 不能复用已有 server —— 那个 server 多半连着开发库 `dev.db`，
    // 会让下面这个 DATABASE_URL 形同虚设，隔离就白做了。
    reuseExistingServer: false,
    env: { DATABASE_URL: E2E_DATABASE_URL },
    timeout: 120_000,
  },
})
