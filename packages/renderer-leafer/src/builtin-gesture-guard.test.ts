// @vitest-environment jsdom
import './leafer-test-stub'
import { afterEach, describe, expect, it } from 'vitest'
import { Leafer, type ILeaferConfig } from 'leafer-ui'
import { assertBuiltinGesturesInert } from './builtin-gesture-guard'

let container: HTMLDivElement | null = null

function createLeafer(config?: ILeaferConfig): Leafer {
  container = document.createElement('div')
  document.body.appendChild(container)
  return new Leafer({ view: container, ...config })
}

afterEach(() => {
  container?.remove()
  container = null
})

describe('内建手势确认（renderer-contract §3.1）', () => {
  it('默认配置的 plain Leafer 通过检查', () => {
    const leafer = createLeafer()
    expect(() => assertBuiltinGesturesInert(leafer)).not.toThrow()
    leafer.destroy()
  })

  it('moveMode 被打开时挂载期直接抛错（防视口状态泄漏）', () => {
    const leafer = createLeafer({ move: { holdSpaceKey: true } })
    expect(() => assertBuiltinGesturesInert(leafer)).toThrow(/内建移动手势被打开/)
    leafer.destroy()
  })
})
