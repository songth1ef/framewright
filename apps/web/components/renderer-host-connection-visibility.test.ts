import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('RendererHost 连线显示', () => {
  it('从本地偏好初始化、切换时持久化，并通过 RenderContext 传给渲染器', () => {
    const source = readFileSync(new URL('./renderer-host.tsx', import.meta.url), 'utf8')

    expect(source).toContain('useState<ConnectionVisibility>(')
    expect(source).toContain('() => readStoredConnectionVisibility()')
    expect(source).toContain('writeStoredConnectionVisibility(next)')
    expect(source).toMatch(
      /const ctx: RenderContext = \{[\s\S]*connectionVisibility,[\s\S]*callbacks,[\s\S]*\}/,
    )
    expect(source).toContain('connectionVisibility={connectionVisibility}')
    expect(source).toContain('onConnectionVisibilityChange={commitConnectionVisibility}')
  })

  it('开关只更新用户观看状态，不修改 node 树、撤销栈或自动保存状态', () => {
    const source = readFileSync(new URL('./renderer-host.tsx', import.meta.url), 'utf8')
    const start = source.indexOf('const commitConnectionVisibility')
    const end = source.indexOf('\n  }, [])', start)
    const callback = source.slice(start, end)

    expect(start).toBeGreaterThan(-1)
    expect(callback).toContain('setConnectionVisibility(next)')
    expect(callback).toContain('writeStoredConnectionVisibility(next)')
    expect(callback).not.toMatch(/setRoot|rootRef|historyRef|commitOps|autosave|dirtyRef/)
  })
})
