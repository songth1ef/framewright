// @vitest-environment jsdom
/**
 * 🔴 诊断探针，不是功能测试。
 *
 * 用途：钉住 plain leafer-ui@2.2.9 的**内建手势运行时默认值**。
 * renderer-leafer 的视口安全依赖「moveMode 与 UI draggable 默认皆关」这个实测结论
 * （docs/renderer-contract.md §3.1）。**升级 leafer-ui 后重跑本文件**——默认值若变，
 * 这里立刻红，比读 changelog 可靠。
 *
 * 结论的完整失效条件见 §3.1：引入 leafer-editor / App、升级版本、启用 multiTouch。
 * 功能性的挂载期检查在 builtin-gesture-guard.ts，本文件不替代它。
 */
import './leafer-test-stub'
import { describe, expect, it } from 'vitest'
import { Leafer, Rect } from 'leafer-ui'

describe('探针：plain Leafer 内建手势默认值（renderer-contract §3.1）', () => {
  it('moveMode 各开关默认全关（能直接改 transform 的只有它和 draggable）', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const leafer = new Leafer({ view: container })

    const move = leafer.config.move ?? {}
    for (const key of ['drag', 'dragEmpty', 'holdSpaceKey', 'holdMiddleKey', 'holdRightKey'] as const) {
      expect(move[key], `config.move.${key} 默认应为关；若变红说明升级改了默认值，重读 §3.1`).toBeFalsy()
    }

    leafer.destroy()
    container.remove()
  })

  it('UI 级 draggable 默认 false（Rect 代表 UI 基类行为）', () => {
    const rect = new Rect({ width: 10, height: 10 })
    expect(rect.draggable).toBe(false)
  })
})
