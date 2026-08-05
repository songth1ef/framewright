export interface ShortcutItem {
  action: string
  keys: readonly string[]
}

export interface ShortcutGroup {
  label: string
  items: readonly ShortcutItem[]
}

/** 只收录 interaction-spec 已定且当前产品已接通的键盘操作。 */
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
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
]
