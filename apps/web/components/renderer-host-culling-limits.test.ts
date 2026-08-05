import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('RendererHost 裁剪预算', () => {
  it('从本地偏好初始化、变更时持久化，并通过 RenderContext 单向传给渲染器', () => {
    const source = readFileSync(new URL('./renderer-host.tsx', import.meta.url), 'utf8')

    expect(source).toContain('() => readStoredViewportCullingLimits()')
    expect(source).toContain('writeStoredViewportCullingLimits(next)')
    expect(source).toMatch(
      /const ctx: RenderContext = \{[\s\S]*cullingLimits: viewportCullingLimits,[\s\S]*callbacks,[\s\S]*\}/,
    )
    expect(source).toContain('cullingLimits={viewportCullingLimits}')
    expect(source).toContain('onCullingLimitsChange={commitViewportCullingLimits}')
    expect(source).toContain('const adapter = entry.create()')
  })

  it('预算是用户本机配置，不修改 node 树、撤销栈或自动保存状态', () => {
    const source = readFileSync(new URL('./renderer-host.tsx', import.meta.url), 'utf8')
    const start = source.indexOf('const commitViewportCullingLimits')
    const end = source.indexOf('\n  }, [])', start)
    const callback = source.slice(start, end)

    expect(start).toBeGreaterThan(-1)
    expect(callback).toContain('setViewportCullingLimits(next)')
    expect(callback).toContain('writeStoredViewportCullingLimits(next)')
    expect(callback).not.toMatch(/setRoot|rootRef|historyRef|commitOps|autosave|dirtyRef/)
  })
})
