import { defineConfig } from 'vitest/config'

// 临时验证用：根 vitest.config.ts 尚未加 provider project（共享文件，归编排方），
// 本文件只用于在领地内跑 `pnpm vitest run --config packages/provider/vitest.config.ts`，
// 根配置补上 provider project 后应删除。
export default defineConfig({
  // --config 指定时 vitest 的 root 仍是 cwd，必须显式钉到本包
  root: import.meta.dirname,
  test: {
    name: 'provider',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
