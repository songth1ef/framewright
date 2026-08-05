import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('ViewportToolbar', () => {
  it('把视口与渲染器操作组织成可访问的正式工具栏', () => {
    const source = readFileSync(new URL('./viewport-toolbar.tsx', import.meta.url), 'utf8')

    expect(source).toContain('role="toolbar"')
    expect(source).toContain('aria-label="画布工具栏"')
    expect(source).toContain('aria-label="缩小"')
    expect(source).toContain('aria-label="放大"')
    expect(source).toContain('适应画布')
    expect(source).toContain('100%')
    expect(source).toContain('formatScale(scale)')
    expect(source).toContain('aria-label="渲染器"')
    expect(source).toContain('data-testid="renderer-switch"')
    expect(source).toContain('data-testid="active-renderer"')
  })
})
