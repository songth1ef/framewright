import type { Corner, Point } from '@framewright/core'
import type { IUI, Leafer } from 'leafer-ui'

/**
 * 一次指针命中的解析结果。
 * 对应 DOM 侧 canvas-interaction 从 event.target 沿 closest() 解析出的三件事：
 * 业务单元 fwId、缩放控制点、内部动作按钮（data-fw-interaction="ignore" 的对应物）。
 */
export interface CanvasHit {
  /** 命中的业务单元 fwId（从命中元素沿父链向上找到的第一个），未命中为 null */
  fwId: string | null
  /** 命中的四角缩放控制点（overlay 上的 fwResizeHandle 标记），未命中为 null */
  resizeHandle: { fwId: string; corner: Corner } | null
  /** 命中内部动作按钮（fwInternalAction 标记）——不参与选中/拖拽/框选（M1 §5） */
  internalAction: boolean
}

export type CanvasHitProbe = (screenPoint: Point) => CanvasHit

const CORNERS: readonly string[] = ['nw', 'ne', 'sw', 'se']

/**
 * Leafer 命中探针：把 selector.getByPoint 的命中元素沿父链走一遍，收集 data 标记。
 * 这是「把 Leafer 当感知器用」（renderer-contract §3）在命中上的具体化——
 * 选中/拖拽/框选的语义判定全部在 canvas-interaction 里走 core 纯函数，
 * 这里只回答「指针下面是什么」，等价 DOM 侧的 closest()。
 *
 * screenPoint 是容器（= Leafer canvas view）内坐标，与 Leafer 事件 x/y 同坐标系；
 * getByPoint 的命中走 __world 变换，已含 host 设置的 leafer.x/y/scale（viewport）。
 */
export function createLeaferHitProbe(leafer: Leafer): CanvasHitProbe {
  return (screenPoint) => {
    // 与 Interaction.findPath 同理：命中前先确保布局最新——
    // draw() 重建场景图后、Leafer 渲染帧之前到达的事件不能拿到过期包围盒
    leafer.updateLayout()
    const target = leafer.selector?.getByPoint(screenPoint, 0)?.target as IUI | undefined

    const hit: CanvasHit = { fwId: null, resizeHandle: null, internalAction: false }
    let current: IUI | undefined = target
    while (current !== undefined) {
      const data = current.data as Record<string, unknown> | undefined
      if (typeof data?.['fwInternalAction'] === 'string') hit.internalAction = true
      const corner = data?.['fwResizeHandle']
      if (
        hit.resizeHandle === null &&
        typeof corner === 'string' &&
        CORNERS.includes(corner) &&
        typeof data?.['fwId'] === 'string'
      ) {
        hit.resizeHandle = { fwId: data['fwId'], corner: corner as Corner }
      }
      if (hit.fwId === null && typeof data?.['fwId'] === 'string') hit.fwId = data['fwId']
      current = current.parent as IUI | undefined
    }
    return hit
  }
}
