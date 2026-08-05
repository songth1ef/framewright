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
import {
  MAX_CONFIGURABLE_CONNECTIONS,
  MAX_CONFIGURABLE_NODES,
  MIN_CONFIGURABLE_CONNECTIONS,
  MIN_CONFIGURABLE_NODES,
  isViewportCullingLimits,
  type ViewportCullingLimits,
} from './viewport-culling-storage'

export interface DevPanelHandle {
  record(op: CanvasOp): void
}

interface DevPanelProps {
  selectedNodes: readonly CanvasNode[]
  entries: readonly DevLogEntry[]
  cullingLimits: ViewportCullingLimits
  onCullingLimitsChange(limits: ViewportCullingLimits): void
  onClear(): void
  /** 初始是否展开。默认 `false` —— 展开态会盖住画布，不能是默认状态。 */
  defaultExpanded?: boolean
}

/**
 * 🔴 定在**右下角**且**默认收起**，不是右上角。
 *
 * 它原先是 `top: 12; right: 12` 一整块常驻展开，把画布工具栏（含渲染器切换按钮）
 * 整个盖住 —— 开发模式下按钮点不到，e2e 里表现为「元素找得到但点不动」。
 * 面板自己的单测全绿，因为它测的是面板本身；**它破坏的是别处**。
 *
 * 规矩：调试面板不许遮挡应用自身的控件。画布类应用的工具栏惯例在顶部，
 * 所以调试入口放底部，且默认只留一个小按钮。
 */
const panelStyle: CSSProperties = {
  position: 'fixed',
  bottom: 12,
  right: 12,
  zIndex: 1000,
  width: 390,
  maxHeight: 'calc(100vh - 120px)',
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

/** 收起时只留这一个小按钮，绝不覆盖画布控件。 */
const collapsedToggleStyle: CSSProperties = {
  position: 'fixed',
  bottom: 12,
  right: 12,
  zIndex: 1000,
  padding: '6px 10px',
  border: '1px solid #344054',
  borderRadius: 6,
  background: 'rgba(16, 24, 40, 0.9)',
  color: '#f2f4f7',
  cursor: 'pointer',
  font: '12px ui-monospace, SFMono-Regular, Consolas, monospace',
}

export function DevPanel({
  selectedNodes,
  entries,
  cullingLimits,
  onCullingLimitsChange,
  onClear,
  defaultExpanded = false,
}: DevPanelProps): ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [fwIdFilter, setFwIdFilter] = useState('')

  if (!expanded) {
    return createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'dev-panel-toggle',
        style: collapsedToggleStyle,
        onClick: () => setExpanded(true),
      },
      `调试面板（${entries.length}）`,
    )
  }
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
    createElement('div', { style: { display: 'flex', alignItems: 'center', margin: '0 0 8px' } },
      createElement('h2', { style: { flex: 1, margin: 0, font: '600 14px system-ui' } }, '开发调试面板'),
      createElement('button', {
        type: 'button',
        'data-testid': 'dev-panel-collapse',
        style: buttonStyle,
        onClick: () => setExpanded(false),
      }, '收起'),
    ),
    createElement('section', null,
      createElement('h3', { style: { margin: '8px 0', font: '600 12px system-ui' } }, '视口裁剪预算'),
      createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
        createElement('label', null,
          '节点上限',
          createElement('input', {
            type: 'number',
            'data-testid': 'max-nodes-input',
            'aria-label': '节点上限',
            min: MIN_CONFIGURABLE_NODES,
            max: MAX_CONFIGURABLE_NODES,
            step: 1,
            value: cullingLimits.maxNodes,
            onChange: (event: { currentTarget: { valueAsNumber: number } }) => {
              const next = { ...cullingLimits, maxNodes: event.currentTarget.valueAsNumber }
              if (isViewportCullingLimits(next)) onCullingLimitsChange(next)
            },
            style: { width: '100%', boxSizing: 'border-box', marginTop: 3 },
          }),
        ),
        createElement('label', null,
          '连线上限',
          createElement('input', {
            type: 'number',
            'data-testid': 'max-connections-input',
            'aria-label': '连线上限',
            min: MIN_CONFIGURABLE_CONNECTIONS,
            max: MAX_CONFIGURABLE_CONNECTIONS,
            step: 1,
            value: cullingLimits.maxConnections,
            onChange: (event: { currentTarget: { valueAsNumber: number } }) => {
              const next = {
                ...cullingLimits,
                maxConnections: event.currentTarget.valueAsNumber,
              }
              if (isViewportCullingLimits(next)) onCullingLimitsChange(next)
            },
            style: { width: '100%', boxSizing: 'border-box', marginTop: 3 },
          }),
        ),
      ),
      createElement('p', { style: { margin: '6px 0 0', color: '#98a2b3' } },
        '调高可显示更多内容，也会增加本机渲染压力。'),
    ),
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

export const DevPanelController = forwardRef<
  DevPanelHandle,
  {
    selectedNodes: readonly CanvasNode[]
    cullingLimits: ViewportCullingLimits
    onCullingLimitsChange(limits: ViewportCullingLimits): void
  }
>(
  function DevPanelController(
    { selectedNodes, cullingLimits, onCullingLimitsChange },
    ref,
  ) {
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
      cullingLimits,
      onCullingLimitsChange,
      onClear: () => setEntries([]),
    })
  },
)
