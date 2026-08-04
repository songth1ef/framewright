// @vitest-environment jsdom
// 🔴 任何 import leafer-ui 的测试文件必须把桩放在第一个 import（见桩内注释）
import './leafer-test-stub'
import { describe, expect, it } from 'vitest'
import type { IUI } from 'leafer-ui'
import { buildInteractionOverlay } from './interaction-overlay'

function findByDataKey(root: IUI, key: string): IUI[] {
  const out: IUI[] = []
  const walk = (ui: IUI): void => {
    const data = ui.data as Record<string, unknown> | undefined
    if (data !== undefined && key in data) out.push(ui)
    for (const child of (ui.children ?? []) as IUI[]) walk(child)
  }
  walk(root)
  return out
}

describe('D2-leafer 交互 overlay：框选框', () => {
  it('无预览时 overlay 为空层', () => {
    const layer = buildInteractionOverlay({ preview: {}, viewportScale: 1 })
    expect((layer.children ?? []).length).toBe(0)
  })

  it('框选框：半透明填充 + 1px 视觉描边（按 1/scale 补偿）', () => {
    const layer = buildInteractionOverlay({
      preview: { marquee: { x: 10, y: 20, width: 30, height: 40 } },
      viewportScale: 2,
    })
    const marquee = findByDataKey(layer, 'fwSelectionMarquee')
    expect(marquee).toHaveLength(1)
    const rect = marquee[0]!
    expect(rect.x).toBe(10)
    expect(rect.y).toBe(20)
    expect(rect.width).toBe(30)
    expect(rect.height).toBe(40)
    expect(rect.strokeWidth).toBe(0.5)
  })

  it('装饰元素不挡命中（Group 非 branchLeaf 不自命中，框选框 hittable:false）', () => {
    const layer = buildInteractionOverlay({
      preview: { marquee: { x: 0, y: 0, width: 10, height: 10 } },
      viewportScale: 1,
    })
    const marquee = findByDataKey(layer, 'fwSelectionMarquee')
    expect(marquee[0]!.hittable).toBe(false)
  })
})
