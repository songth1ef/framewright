import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/renderer-leafer/probes/browser/**/*.test.ts'],
  },
})
