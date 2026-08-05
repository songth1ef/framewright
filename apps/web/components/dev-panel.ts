'use client'

import type { CanvasNode, CanvasOp } from '@framewright/core'
import {
  createElement,
  forwardRef,
  useImperativeHandle,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react'
import { canvasOpToDevLogEntries, type DevLogEntry } from './dev-panel-log'

export interface DevPanelHandle {
  record(op: CanvasOp): void
}

interface DevPanelProps {
  selectedNodes: readonly CanvasNode[]
  entries: readonly DevLogEntry[]
  onClear(): void
}

const panelStyle: CSSProperties = {
  position: 'fixed',
  top: 12,
  right: 12,
  zIndex: 1000,
  width: 390,
  maxHeight: 'calc(100vh - 24px)',
  overflow: 'auto',
  padding: 12,
  border: '1px solid #344054',
  borderRadius: 8,
  background: 'rgba(16, 24, 40, 0.96)',
  color: '#f2f4f7',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.28)',
  font: '12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace',
}

const buttonStyle: CSSProperties = {
  border: '1px solid #667085',
  borderRadius: 4,
  padding: '3px 8px',
  background: '#344054',
  color: '#fff',
  cursor: 'pointer',
}

function copyJson(node: CanvasNode): void {
  void navigator.clipboard.writeText(JSON.stringify(node, null, 2))
}

export function DevPanel({ selectedNodes, entries, onClear }: DevPanelProps): ReactElement {
  const [fwIdFilter, setFwIdFilter] = useState('')
  const filteredEntries = fwIdFilter === ''
    ? entries
    : entries.filter((entry) => entry.fwId.includes(fwIdFilter))

  const nodeSections = selectedNodes.length === 0
    ? createElement('p', { style: { color: '#98a2b3' } }, '未选中节点')
    : selectedNodes.map((node) => createElement(
        'details',
        { key: node.fwId, style: { marginBottom: 8 } },
        createElement(
          'summary',
          { style: { cursor: 'pointer' } },
          node.fwId,
          ' ',
          createElement(
            'button',
            {
              type: 'button',
              'data-testid': `copy-node-json-${node.fwId}`,
              style: { ...buttonStyle, marginLeft: 8 },
              onClick: (event: { preventDefault(): void }) => {
                event.preventDefault()
                copyJson(node)
              },
            },
            '复制 JSON',
          ),
        ),
        createElement('pre', {
          style: { margin: '6px 0 0', padding: 8, overflow: 'auto', background: '#101828' },
        }, JSON.stringify(node, null, 2)),
      ))

  const logRows = filteredEntries.length === 0
    ? createElement('li', { style: { color: '#98a2b3' } }, '暂无变更')
    : filteredEntries.map((entry) => createElement(
        'li',
        {
          key: entry.id,
          style: {
            padding: '5px 0',
            borderBottom: '1px solid #344054',
            overflowWrap: 'anywhere',
          },
        },
        createElement('time', { dateTime: entry.timestamp, style: { color: '#98a2b3' } },
          new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour12: false })),
        entry.gestureId === undefined
          ? ' '
          : createElement('span', { title: `同一次手势 ${entry.gestureId}`, style: { color: '#fdb022' } }, ' [手势] '),
        `${entry.fwId} · ${entry.field} : ${entry.oldValue} → ${entry.newValue}`,
      ))

  return createElement(
    'aside',
    { 'data-testid': 'dev-panel', style: panelStyle },
    createElement('h2', { style: { margin: '0 0 8px', font: '600 14px system-ui' } }, '开发调试面板'),
    createElement('section', null,
      createElement('h3', { style: { margin: '8px 0', font: '600 12px system-ui' } }, '选中节点 JSON'),
      nodeSections,
    ),
    createElement('section', null,
      createElement('div', { style: { display: 'flex', gap: 6, alignItems: 'center', margin: '10px 0 6px' } },
        createElement('h3', { style: { flex: 1, margin: 0, font: '600 12px system-ui' } }, '属性变更流水'),
        createElement('input', {
          'data-testid': 'dev-log-filter',
          'aria-label': '按 fwId 筛选',
          value: fwIdFilter,
          placeholder: '筛选 fwId',
          onChange: (event: { currentTarget: { value: string } }) => setFwIdFilter(event.currentTarget.value),
          style: { width: 110, padding: '3px 6px', borderRadius: 4, border: '1px solid #667085' },
        }),
        createElement('button', {
          type: 'button',
          'data-testid': 'clear-dev-log',
          style: buttonStyle,
          onClick: onClear,
        }, '清空'),
      ),
      createElement('ol', { style: { margin: 0, paddingLeft: 20 } }, logRows),
    ),
  )
}

export const DevPanelController = forwardRef<DevPanelHandle, { selectedNodes: readonly CanvasNode[] }>(
  function DevPanelController({ selectedNodes }, ref) {
    const [entries, setEntries] = useState<readonly DevLogEntry[]>([])
    useImperativeHandle(ref, () => ({
      record(op) {
        const timestamp = new Date().toISOString()
        setEntries((current) => [...current, ...canvasOpToDevLogEntries(op, timestamp)])
      },
    }), [])
    return createElement(DevPanel, {
      selectedNodes,
      entries,
      onClear: () => setEntries([]),
    })
  },
)
