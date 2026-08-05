import { describe, expect, it } from 'vitest'
import { getViewportShortcut, isEditableTarget } from './viewport-shortcuts'

describe('视口快捷键', () => {
  it('识别 Shift+1 适应内容与 Ctrl/Cmd+0 适应画布', () => {
    expect(getViewportShortcut({ code: 'Digit1', key: '!', shiftKey: true })).toBe('fit-content')
    expect(getViewportShortcut({ code: 'Digit0', key: '0', ctrlKey: true })).toBe('fit-canvas')
    expect(getViewportShortcut({ code: 'Digit0', key: '0', metaKey: true })).toBe('fit-canvas')
  })

  it('不把普通数字键或带多余修饰键的组合当成快捷键', () => {
    expect(getViewportShortcut({ code: 'Digit1', key: '1' })).toBeNull()
    expect(
      getViewportShortcut({ code: 'Digit1', key: '!', shiftKey: true, ctrlKey: true }),
    ).toBeNull()
  })

  it('输入框、文本域和可编辑区域都视为文本输入目标', () => {
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isEditableTarget({ tagName: 'textarea' })).toBe(true)
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
    expect(isEditableTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})
