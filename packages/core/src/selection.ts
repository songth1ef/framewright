/** 选中集合并的并入方式。渲染器只上报「最小集合 + mode」，最终集由本函数统一计算。 */
export type SelectionMode = 'replace' | 'toggle' | 'add'

function dedupe(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}

/**
 * 计算最终选中集。全部模式去重且保序，不修改入参。
 * - replace：结果 = requested 去重
 * - toggle：requested 中已在 current 的移除、不在的追加
 * - add：并集，current 在前、新增在后，已存在项不动位置
 */
export function applySelection(
  current: readonly string[],
  requested: readonly string[],
  mode: SelectionMode,
): readonly string[] {
  switch (mode) {
    case 'replace':
      return dedupe(requested)
    case 'toggle': {
      const requestedSet = new Set(requested)
      const kept = current.filter((id) => !requestedSet.has(id))
      const currentSet = new Set(current)
      const appended = dedupe(requested).filter((id) => !currentSet.has(id))
      return [...kept, ...appended]
    }
    case 'add': {
      const currentSet = new Set(current)
      return [...current, ...dedupe(requested).filter((id) => !currentSet.has(id))]
    }
  }
}
