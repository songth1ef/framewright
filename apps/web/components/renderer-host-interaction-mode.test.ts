import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('RendererHost 交互模式', () => {
  it('从本地偏好初始化、切换时持久化，并通过 RenderContext 传给渲染器', () => {
    const source = readFileSync(new URL('./renderer-host.tsx', import.meta.url), 'utf8')

    expect(source).toContain('useState<InteractionMode>(')
    // 2026-08-07 收编统一设置：真相源从独立 localStorage 键改为 loadSettings()/commitSetting。
    // 守的不变量未变（初始化读偏好、切换时持久化、经 RenderContext 单向传给渲染器）。
    expect(source).toContain('loadSettings().interactionMode')
    expect(source).toContain("commitSetting('interactionMode', next)")
    expect(source).toMatch(/const ctx: RenderContext = \{[\s\S]*interactionMode,[\s\S]*callbacks,[\s\S]*\}/)
    expect(source).toContain('interactionMode={interactionMode}')
    expect(source).toContain('onInteractionModeChange={commitInteractionMode}')
  })
})
