import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          environment: 'node',
          include: ['packages/core/src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'renderer-dom',
          environment: 'jsdom',
          include: ['packages/renderer-dom/src/**/*.test.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'renderer-leafer',
          environment: 'node',
          include: ['packages/renderer-leafer/src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'provider',
          environment: 'node',
          include: ['packages/provider/src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'server-core',
          environment: 'node',
          include: ['packages/server-core/src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'web',
          environment: 'node',
          // 动态路由目录（如 [id]）必须由 ** 匹配；不要把字面量 [id]
          // 写进 glob，否则方括号会被解释为字符集，测试会静默漏出全量门禁。
          include: [
            'apps/web/app/**/*.test.{ts,tsx}',
            'apps/web/components/**/*.test.{ts,tsx}',
          ],
        },
      },
    ],
  },
})
