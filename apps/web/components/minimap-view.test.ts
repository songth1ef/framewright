import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('minimap view 结构', () => {
  const source = readFileSync(new URL('./minimap-view.tsx', import.meta.url), 'utf8')

  it('固定为一个 canvas 形状层和一个独立视口框', () => {
    expect(source.match(/<canvas/g)).toHaveLength(1)
    expect(source).toContain('data-testid="minimap-content-canvas"')
    expect(source).toContain('data-testid="minimap-viewport"')
  })

  it('矩形绘制项只依赖 root，viewport 变化不重算内容层', () => {
    expect(source).toMatch(/createMinimapDrawItems\(root\)[\s\S]*?\[root\]/)
    expect(source).toContain('context.fillRect(')
    expect(source).toContain('projectViewportFrame(viewport, viewportSize, projection)')
  })

  it('定位在画布左下角且不是 fixed，不会覆盖画布上方工具栏', () => {
    expect(source).toMatch(/position: 'absolute', left: 12, bottom: 12/)
    expect(source).not.toContain("position: 'fixed'")
  })
})
