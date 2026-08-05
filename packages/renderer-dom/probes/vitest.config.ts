import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/renderer-dom/probes/browser/**/*.test.ts'],
  },
})
