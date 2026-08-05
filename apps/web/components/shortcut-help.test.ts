import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SHORTCUT_GROUPS } from './shortcut-help'

describe('快捷键帮助', () => {
  it('逐项列出 interaction-spec 已接通的全部键盘快捷键', () => {
    expect(SHORTCUT_GROUPS).toEqual([
      {
        label: '视口',
        items: [
          { action: '以指针为中心缩放', keys: ['Ctrl / Cmd', '滚轮'] },
          { action: '放大', keys: ['Ctrl', '='] },
          { action: '缩小', keys: ['Ctrl', '-'] },
          { action: '适应内容', keys: ['Shift', '1'] },
          { action: '适应画布', keys: ['Ctrl', '0'] },
          { action: '抓手平移', keys: ['Space', '拖拽'] },
        ],
      },
      {
        label: '选择',
        items: [
          { action: '全选', keys: ['Ctrl', 'A'] },
          { action: '取消选择', keys: ['Esc'] },
        ],
      },
      {
        label: '编辑',
        items: [
          { action: '微调 1px', keys: ['方向键'] },
          { action: '快速微调 10px', keys: ['Shift', '方向键'] },
          { action: '删除选中项', keys: ['Delete / Backspace'] },
          { action: '撤销', keys: ['Ctrl', 'Z'] },
          { action: '重做', keys: ['Ctrl', 'Shift', 'Z'] },
        ],
      },
    ])
  })

  it('帮助面板与空画布引导使用可访问语义', () => {
    const source = readFileSync(new URL('./canvas-overlays.tsx', import.meta.url), 'utf8')
    expect(source).toContain('role="dialog"')
    expect(source).toContain('aria-modal="true"')
    expect(source).toContain('aria-labelledby="shortcut-help-title"')
    expect(source).toContain('data-testid="empty-canvas-guide"')
  })
})
