import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('RendererHost 连线显示', () => {
  it('从本地偏好初始化、切换时持久化，并通过 RenderContext 传给渲染器', () => {
    const source = readFileSync(new URL('./renderer-host.tsx', import.meta.url), 'utf8')

    expect(source).toContain('useState<ConnectionVisibility>(')
    // 2026-08-07 收编统一设置：真相源从独立 localStorage 键改为 loadSettings()/commitSetting。
    // 守的不变量未变（初始化读偏好、切换时持久化、经 RenderContext 单向传给渲染器）。
    expect(source).toContain('loadSettings().connectionVisibility')
    expect(source).toContain("commitSetting('connectionVisibility', next)")
    expect(source).toMatch(
      /const ctx: RenderContext = \{[\s\S]*connectionVisibility,[\s\S]*callbacks,[\s\S]*\}/,
    )
    expect(source).toContain('connectionVisibility={connectionVisibility}')
    expect(source).toContain('onConnectionVisibilityChange={commitConnectionVisibility}')
  })

  it('开关只更新用户观看状态，不修改 node 树、撤销栈或自动保存状态', () => {
    const source = readFileSync(new URL('./renderer-host.tsx', import.meta.url), 'utf8')
    const start = source.indexOf('const commitConnectionVisibility')
    // 依赖数组已从 [] 变为 [commitSetting]，按 '}, [' 找边界而不是写死空数组
    const end = source.indexOf('\n  }, [', start)
    const callback = source.slice(start, end)

    expect(start).toBeGreaterThan(-1)
    expect(callback).toContain('setConnectionVisibility(next)')
    expect(callback).toContain("commitSetting('connectionVisibility', next)")
    expect(callback).not.toMatch(/setRoot|rootRef|historyRef|commitOps|autosave|dirtyRef/)
  })
})
