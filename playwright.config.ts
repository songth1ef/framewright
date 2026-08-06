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
    //
    // 🔴 migrate 必须串在 next dev 前面，不能只靠 globalSetup ——
    // Playwright 先起 webServer 并等首页返回 2xx，而首页要查 Document 表；
    // 全新机器上 e2e.db 还没有表，首页 500 → 等满 120s 超时 →
    // globalSetup 里那句建表**永远轮不到执行**。跑过一次 e2e 的机器上库里已有表，
    // 所以这个死锁只在干净克隆上出现，报错还只说「webServer 超时」，指不到根因。
    // globalSetup 仍负责每轮重置（删库重建），职责不变。
    command:
      `node tools/prisma.mjs migrate deploy --schema prisma/schema.prisma && ` +
      `pnpm --filter @framewright/web exec next dev -p ${e2ePort}`,
    url: e2eBaseUrl,
    // 🔴 不能复用已有 server —— 那个 server 多半连着开发库 `dev.db`，
    // 会让下面这个 DATABASE_URL 形同虚设，隔离就白做了。
    reuseExistingServer: false,
    env: { DATABASE_URL: E2E_DATABASE_URL },
    timeout: 120_000,
  },
})
