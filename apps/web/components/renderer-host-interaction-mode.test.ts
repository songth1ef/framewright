import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('RendererHost 交互模式', () => {
  it('从本地偏好初始化、切换时持久化，并通过 RenderContext 传给渲染器', () => {
    const source = readFileSync(new URL('./renderer-host.tsx', import.meta.url), 'utf8')

    expect(source).toContain('useState<InteractionMode>(')
    expect(source).toContain('() => readStoredInteractionMode()')
    expect(source).toContain('writeStoredInteractionMode(next)')
    expect(source).toMatch(/const ctx: RenderContext = \{[\s\S]*interactionMode,[\s\S]*callbacks,[\s\S]*\}/)
    expect(source).toContain('interactionMode={interactionMode}')
    expect(source).toContain('onInteractionModeChange={commitInteractionMode}')
  })
})
