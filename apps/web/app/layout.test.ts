import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('RootLayout', () => {
  it('允许浏览器扩展向 html 注入属性而不产生 hydration mismatch 噪音', () => {
    const source = readFileSync(new URL('./layout.tsx', import.meta.url), 'utf8')
    expect(source).toMatch(/<html\s+lang="zh-CN"\s+suppressHydrationWarning>/)
  })
})
