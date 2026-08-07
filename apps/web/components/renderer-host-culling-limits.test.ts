import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * 这些是**源码结构断言**：守的是「预算与阈值从哪来、往哪去」这条数据流，
 * 而不是某次渲染的结果。2026-08-06 收编统一设置时，正是这两条测试
 * 第一时间抓住了「换了真相源」这件事。
 */
describe('RendererHost 裁剪预算与 LOD 阈值', () => {
  const source = (): string =>
    readFileSync(new URL('./renderer-host.tsx', import.meta.url), 'utf8')

  it('从统一设置初始化，并通过 RenderContext 单向传给渲染器', () => {
    const code = source()

    // 唯一真相源是 loadSettings()，不再是各自独立的 localStorage 键
    expect(code).toContain('useState(() => loadSettings())')
    expect(code).toMatch(
      /const ctx: RenderContext = \{[\s\S]*cullingLimits: viewportCullingLimits,[\s\S]*lodThresholds,[\s\S]*callbacks,[\s\S]*\}/,
    )
    expect(code).toContain('cullingLimits={viewportCullingLimits}')
    expect(code).toContain('onCullingLimitsChange={commitViewportCullingLimits}')
    expect(code).toContain('const adapter = entry.create()')
  })

  // 🔴 LOD 阈值此前**根本没有来源**：两个渲染器都直接调 getViewportLod(scale)，
  // 于是设置页改了「简化细节阈值」画布毫无反应。这条守住阈值真的被传下去。
  it('LOD 阈值来自设置并进入 RenderContext', () => {
    const code = source()
    expect(code).toContain('fullDetailScale: appSettings.performance.fullDetailScale')
    expect(code).toContain('simplifiedDetailScale: appSettings.performance.simplifiedDetailScale')
    expect(code).toContain('lodThresholds,')
  })

  it('预算是用户本机配置，不修改 node 树、撤销栈或自动保存状态', () => {
    const code = source()
    const start = code.indexOf('const commitViewportCullingLimits')
    const end = code.indexOf('\n  }, [])', start)
    const callback = code.slice(start, end)

    expect(start).toBeGreaterThan(-1)
    expect(callback).toContain('setViewportCullingLimits(next)')
    expect(callback).not.toMatch(/setRoot|rootRef|historyRef|commitOps|autosave|dirtyRef/)
    // 不再双写旧键：双真相源会让设置页与开发面板改的是两份数据，谁后写谁赢
    expect(callback).not.toContain('writeStoredViewportCullingLimits')
  })
})
