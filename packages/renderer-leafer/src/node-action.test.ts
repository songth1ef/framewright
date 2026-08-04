// @vitest-environment jsdom
import './leafer-test-stub'
import { describe, expect, it, vi } from 'vitest'
import {
  NODE_ACTIONS,
  createAiImageNode,
  createBoxNode,
  type RendererCallbacks,
} from '@framewright/core'
import { Text, type IUI } from 'leafer-ui'
import { dispatchNodeActionTap, findNodeAction } from './node-action'
import { LEAFER_SHAPES } from './shapes/registry'

function makeCallbacks(): RendererCallbacks {
  return {
    onSelectionRequest: vi.fn(),
    onNodesMove: vi.fn(),
    onNodesResize: vi.fn(),
    onNodesDelete: vi.fn(),
    onViewportChange: vi.fn(),
    onNodeActivate: vi.fn(),
    onNodeAction: vi.fn(),
  }
}

/** 与 index.ts buildNode 相同的 fwId 标记方式 */
function tagFwId(ui: IUI, fwId: string): IUI {
  ui.data = { ...(ui.data as Record<string, unknown> | undefined), fwId }
  return ui
}

function collectAll(root: IUI): IUI[] {
  const out: IUI[] = [root]
  for (const child of root.children ?? []) out.push(...collectAll(child as IUI))
  return out
}

function findByText(root: IUI, text: string): IUI {
  const found = collectAll(root).find((e) => e.tag === 'Text' && String((e as Text).text) === text)
  if (found === undefined) throw new Error(`找不到文本元素: ${text}`)
  return found
}

describe('D0-min-leafer findNodeAction', () => {
  it('empty 态「点击生成」解析出所属节点 fwId 与 generate', () => {
    const node = createAiImageNode({ fwId: 'g1', status: 'empty' })
    const container = tagFwId(LEAFER_SHAPES['ai-image']({ node, position: { x: 0, y: 0 }, selected: false }), 'g1')
    const button = findByText(container, '点击生成')
    expect(findNodeAction(button)).toEqual({ fwId: 'g1', action: NODE_ACTIONS.generate })
  })

  it('failed 态「重试」解析出 retry', () => {
    const node = createAiImageNode({ fwId: 'g2', status: 'failed' })
    const container = tagFwId(LEAFER_SHAPES['ai-image']({ node, position: { x: 0, y: 0 }, selected: false }), 'g2')
    const button = findByText(container, '重试')
    expect(findNodeAction(button)).toEqual({ fwId: 'g2', action: NODE_ACTIONS.retry })
  })

  it('普通节点 / 非按钮内部元素解析为 null', () => {
    const node = createBoxNode({ fwId: 'b1' })
    const box = tagFwId(LEAFER_SHAPES.box({ node, position: { x: 0, y: 0 }, selected: false }), 'b1')
    expect(findNodeAction(box)).toBeNull()

    // succeeded 态内部元素（footer 文本等）都不是按钮
    const okNode = createAiImageNode({ fwId: 'g3', status: 'succeeded' })
    const okContainer = tagFwId(
      LEAFER_SHAPES['ai-image']({ node: okNode, position: { x: 0, y: 0 }, selected: false }),
      'g3',
    )
    for (const el of collectAll(okContainer)) {
      expect(findNodeAction(el)).toBeNull()
    }
  })
})

describe('D0-min-leafer M1 §7 验收 4：点击内部按钮只触发 onNodeAction', () => {
  it.each([
    ['empty', '点击生成', NODE_ACTIONS.generate],
    ['failed', '重试', NODE_ACTIONS.retry],
  ] as const)('%s 态的「%s」只上报 onNodeAction(%s)', (status, text, action) => {
    const node = createAiImageNode({ fwId: 'g1', status })
    const container = tagFwId(LEAFER_SHAPES['ai-image']({ node, position: { x: 0, y: 0 }, selected: false }), 'g1')
    const button = findByText(container, text)
    const callbacks = makeCallbacks()

    dispatchNodeActionTap(button, callbacks)

    expect(callbacks.onNodeAction).toHaveBeenCalledOnce()
    expect(callbacks.onNodeAction).toHaveBeenCalledWith('g1', action)
    expect(callbacks.onSelectionRequest).not.toHaveBeenCalled()
    expect(callbacks.onNodesMove).not.toHaveBeenCalled()
    expect(callbacks.onNodesResize).not.toHaveBeenCalled()
    expect(callbacks.onNodesDelete).not.toHaveBeenCalled()
    expect(callbacks.onViewportChange).not.toHaveBeenCalled()
    expect(callbacks.onNodeActivate).not.toHaveBeenCalled()
  })

  it('点到非按钮元素：onNodeAction 也不触发', () => {
    const node = createAiImageNode({ fwId: 'g1', status: 'succeeded' })
    const container = tagFwId(LEAFER_SHAPES['ai-image']({ node, position: { x: 0, y: 0 }, selected: false }), 'g1')
    const callbacks = makeCallbacks()
    dispatchNodeActionTap(container, callbacks)
    expect(callbacks.onNodeAction).not.toHaveBeenCalled()
  })
})
