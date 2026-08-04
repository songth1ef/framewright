import { type CanvasNode, type FrameNode, isFrameNode } from './node-schema'

/**
 * 有效可见性 = 自身 visible 且全部祖先 visible。
 * 这是可见性级联语义的单一真相源：两个渲染器都必须渲染出与本函数一致的结果，
 * 谁都不许自己实现一套级联规则。
 */
export function collectVisibleNodeIds(root: FrameNode): readonly string[] {
  const visible: string[] = []
  const walk = (node: CanvasNode): void => {
    if (!node.visible) return
    visible.push(node.fwId)
    if (isFrameNode(node)) {
      for (const child of node.children) walk(child)
    }
  }
  walk(root)
  return visible
}

/** 单点查询，语义与 collectVisibleNodeIds 一致。 */
export function isEffectivelyVisible(root: FrameNode, fwId: string): boolean {
  return collectVisibleNodeIds(root).includes(fwId)
}
