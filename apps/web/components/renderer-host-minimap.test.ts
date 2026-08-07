import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('RendererHost minimap 接线', () => {
  const source = readFileSync(new URL('./renderer-host.tsx', import.meta.url), 'utf8')

  it('总范围只通过 core getContentBounds 从 root 变化派生', () => {
    expect(source).toContain('useMemo(() => getContentBounds(root), [root])')
    expect(source).toContain('bounds={contentBounds}')
  })

  it('开关初始化读取并写回 localStorage 偏好', () => {
    // 2026-08-07 收编统一设置：真相源从独立 localStorage 键改为 loadSettings()/commitSetting。
    // 守的不变量未变（初始化读偏好、切换时持久化、经 RenderContext 单向传给渲染器）。
    expect(source).toContain('loadSettings().minimapVisible')
    expect(source).toContain("commitSetting('minimapVisible', next)")
  })

  it('minimap 挂在画布定位容器内，不进入上方工具栏', () => {
    const toolbar = source.indexOf('<ViewportToolbar')
    const canvasContainer = source.indexOf('data-testid="canvas-container"')
    const minimap = source.indexOf('<Minimap')

    expect(toolbar).toBeGreaterThanOrEqual(0)
    expect(canvasContainer).toBeGreaterThan(toolbar)
    expect(minimap).toBeGreaterThan(canvasContainer)
  })
})
