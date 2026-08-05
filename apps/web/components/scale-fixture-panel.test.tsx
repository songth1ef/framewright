import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// web 项目跑在 node 环境（无 jsdom），tsx 组件按仓内惯例做源码级断言
// （同 viewport-toolbar.test.tsx）。
describe('ScaleFixturePanel', () => {
  const source = readFileSync(new URL('./scale-fixture-panel.tsx', import.meta.url), 'utf8')

  it('提供节点数与连线形态选择和生成按钮', () => {
    expect(source).toContain('data-testid="scale-fixture-panel"')
    expect(source).toContain('data-testid="scale-fixture-node-count"')
    expect(source).toContain('data-testid="scale-fixture-connection-pattern"')
    expect(source).toContain('data-testid="generate-scale-fixture"')
    expect(source).toContain('aria-label="节点数"')
    expect(source).toContain('aria-label="连线形态"')
  })

  it('有进度反馈与大画布提示，避免用户以为卡死', () => {
    expect(source).toContain('role="status"')
    expect(source).toContain('data-testid="scale-fixture-status"')
    expect(source).toContain('role="alert"')
    expect(source).toContain('data-testid="scale-fixture-error"')
    expect(source).toContain('data-testid="scale-fixture-large-hint"')
    expect(source).toContain('页面没有卡死')
    expect(source).toContain('formatPayloadSize(stage.payloadBytes)')
  })

  it('记住上次选择：挂载时读取、变更时写入 localStorage', () => {
    expect(source).toContain('readStoredScaleFixtureParams()')
    expect(source).toContain('writeStoredScaleFixtureParams(next)')
  })

  it('生成后跳转到新画布', () => {
    expect(source).toContain("router.push(`/canvas/${encodeURIComponent(created.id)}`)")
  })
})

describe('scale fixture actions 唯一生成来源', () => {
  it('🔴 生成只调 core 的 createScaleFixture，不在 web 层另写生成逻辑', () => {
    const actions = readFileSync(new URL('./scale-fixture-actions.ts', import.meta.url), 'utf8')

    expect(actions).toContain("from '@framewright/core'")
    expect(actions).toContain('createScaleFixture({')
    // 节点构造函数只能出现在 core；web 层出现即说明分叉了。
    expect(actions).not.toContain('createImgNode')
    expect(actions).not.toContain('createAiImageNode')
  })
})
