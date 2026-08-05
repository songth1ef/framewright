import { createBoxNode } from '@framewright/core'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DevPanel } from './dev-panel'

const cullingProps = {
  cullingLimits: { maxNodes: 1_500, maxConnections: 1_000 },
  onCullingLimitsChange: () => undefined,
}

describe('DevPanel', () => {
  it('🔴 默认收起，只渲染一个小按钮 —— 展开态会盖住画布工具栏', () => {
    // 回归守卫：面板原先默认展开且钉在右上角，把渲染器切换按钮整个盖住，
    // 开发模式下点不到，e2e 里表现为「元素找得到但点不动」。
    // 面板自己的单测当时全绿，因为它只测面板本身 —— 它破坏的是别处。
    const html = renderToStaticMarkup(createElement(DevPanel, {
      selectedNodes: [createBoxNode({ fwId: 'box-1', name: '完整节点' })],
      entries: [],
      ...cullingProps,
      onClear: () => undefined,
    }))

    expect(html).toContain('data-testid="dev-panel-toggle"')
    expect(html).not.toContain('data-testid="dev-panel"')
    expect(html).not.toContain('<details')
  })

  it('展示可折叠的完整节点 JSON，并提供复制、fwId 筛选和清空入口', () => {
    const node = createBoxNode({ fwId: 'box-1', name: '完整节点' })
    const html = renderToStaticMarkup(createElement(DevPanel, {
      defaultExpanded: true,
      selectedNodes: [node],
      ...cullingProps,
      entries: [{
        id: 'entry-1',
        timestamp: '2026-08-04T12:34:56.000Z',
        fwId: 'box-1',
        field: 'x',
        oldValue: '0',
        newValue: '20',
      }],
      onClear: () => undefined,
    }))

    expect(html).toContain('<details')
    expect(html).toContain('&quot;fwId&quot;: &quot;box-1&quot;')
    expect(html).toContain('data-testid="copy-node-json-box-1"')
    expect(html).toContain('data-testid="dev-log-filter"')
    expect(html).toContain('data-testid="clear-dev-log"')
    expect(html).toContain('data-testid="max-nodes-input"')
    expect(html).toContain('aria-label="节点上限"')
    expect(html).toContain('value="1500"')
    expect(html).toContain('data-testid="max-connections-input"')
    expect(html).toContain('aria-label="连线上限"')
    expect(html).toContain('value="1000"')
    expect(html).toContain('box-1 · x : 0 → 20')
  })
})
