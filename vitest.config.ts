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
    ],
  },
})
