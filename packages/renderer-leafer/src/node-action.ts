import type { RendererCallbacks } from '@framewright/core'
import type { IUI } from 'leafer-ui'

/**
 * D0-min-leafer：内部动作按钮（点击生成 / 重试）的命中解析（M1 §5）。
 *
 * 内部按钮在创建时只打 `data.fwInternalAction` 标记；每个 node 容器在
 * `buildNode` 里打 `data.fwId` 标记。tap 时从事件目标沿父链向上找：
 * 先拿到 action、再拿到所属业务单元的 fwId，才构成一次 onNodeAction。
 * 走到 node 容器还没有 action = 点到的是普通节点，不触发。
 */
export interface NodeActionHit {
  fwId: string
  action: string
}

export function findNodeAction(target: IUI): NodeActionHit | null {
  let action: string | null = null
  let current: IUI | undefined = target
  while (current !== undefined) {
    const data = current.data as Record<string, unknown> | undefined
    if (action === null && typeof data?.fwInternalAction === 'string') {
      action = data.fwInternalAction
    }
    if (typeof data?.fwId === 'string') {
      return action === null ? null : { fwId: data.fwId, action }
    }
    current = current.parent as IUI | undefined
  }
  return null
}

/** tap 分派：只有命中内部按钮才上报，其余回调一概不碰（M1 §7 验收 4）。 */
export function dispatchNodeActionTap(target: IUI, callbacks: RendererCallbacks): void {
  const hit = findNodeAction(target)
  if (hit !== null) callbacks.onNodeAction(hit.fwId, hit.action)
}
