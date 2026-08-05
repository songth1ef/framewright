import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('RendererHost 开发面板门控', () => {
  it('只在 NODE_ENV 非 production 时启用', () => {
    const source = readFileSync(new URL('./renderer-host.tsx', import.meta.url), 'utf8')
    expect(source).toContain("process.env.NODE_ENV !== 'production'")
    expect(source).toMatch(/DEV_PANEL_ENABLED\s*\?\s*\(\s*<DevPanelController/)
  })
})
