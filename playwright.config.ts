import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // e2e 共用同一个本地 SQLite；并行创建 Document 会互相争抢写锁。
  workers: 1,
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
  use: { baseURL: 'http://localhost:3100' },
  webServer: {
    command: 'pnpm --filter @framewright/web dev',
    url: 'http://localhost:3100',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
