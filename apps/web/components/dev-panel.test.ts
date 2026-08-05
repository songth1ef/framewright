import { createBoxNode } from '@framewright/core'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DevPanel } from './dev-panel'

describe('DevPanel', () => {
  it('展示可折叠的完整节点 JSON，并提供复制、fwId 筛选和清空入口', () => {
    const node = createBoxNode({ fwId: 'box-1', name: '完整节点' })
    const html = renderToStaticMarkup(createElement(DevPanel, {
      selectedNodes: [node],
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
    expect(html).toContain('box-1 · x : 0 → 20')
  })
})
