import type { InteractionMode } from '@framewright/core'
import { useRef, type CSSProperties } from 'react'

interface RendererOption {
  id: string
  label: string
}

interface ViewportToolbarProps {
  activeRendererId: string
  renderers: readonly RendererOption[]
  interactionMode: InteractionMode
  scale: number
  disabled: boolean
  onRendererChange(id: string): void
  onInteractionModeChange(mode: InteractionMode): void
  onZoomIn(): void
  onZoomOut(): void
  onFitCanvas(): void
  onActualSize(): void
  onShowShortcuts(): void
  onImportFile(file: File): void | Promise<void>
  onExport(): void
}

const toolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  flexWrap: 'wrap',
  minHeight: 44,
  marginBottom: 12,
  padding: '6px 8px',
  border: '1px solid #e4e7ec',
  borderRadius: 12,
  background: '#fff',
  boxShadow: '0 2px 8px rgba(16, 24, 40, 0.08)',
}

const groupStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}

const buttonStyle: CSSProperties = {
  minWidth: 34,
  height: 32,
  padding: '0 10px',
  border: '1px solid transparent',
  borderRadius: 8,
  color: '#344054',
  background: 'transparent',
  font: 'inherit',
  fontSize: 13,
  cursor: 'pointer',
}

function formatScale(scale: number): string {
  const percentage = Math.round(scale * 1000) / 10
  return `${percentage}%`
}

export function ViewportToolbar({
  activeRendererId,
  renderers,
  interactionMode,
  scale,
  disabled,
  onRendererChange,
  onInteractionModeChange,
  onZoomIn,
  onZoomOut,
  onFitCanvas,
  onActualSize,
  onShowShortcuts,
  onImportFile,
  onExport,
}: ViewportToolbarProps) {
  const importInputRef = useRef<HTMLInputElement>(null)
  const activeIndex = renderers.findIndex((renderer) => renderer.id === activeRendererId)
  const active = renderers[activeIndex]
  const next = renderers[(activeIndex + 1) % renderers.length]
  const nextInteractionMode: InteractionMode = interactionMode === 'unified' ? 'native' : 'unified'
  const interactionModeLabel = interactionMode === 'unified' ? '统一' : '原生'
  const nextInteractionModeLabel = nextInteractionMode === 'unified' ? '统一' : '原生'

  return (
    <div role="toolbar" aria-label="画布工具栏" data-testid="toolbar" style={toolbarStyle}>
      <div role="group" aria-label="缩放" style={groupStyle}>
        <button
          type="button"
          aria-label="缩小"
          title="缩小（Ctrl+-）"
          disabled={disabled}
          onClick={onZoomOut}
          style={buttonStyle}
        >
          −
        </button>
        <output
          data-testid="viewport-scale"
          aria-label="当前缩放比例"
          style={{ minWidth: 58, textAlign: 'center', color: '#101828', fontSize: 13 }}
        >
          {formatScale(scale)}
        </output>
        <button
          type="button"
          aria-label="放大"
          title="放大（Ctrl+=）"
          disabled={disabled}
          onClick={onZoomIn}
          style={buttonStyle}
        >
          +
        </button>
        <span aria-hidden="true" style={{ width: 1, height: 20, margin: '0 4px', background: '#e4e7ec' }} />
        <button type="button" disabled={disabled} onClick={onFitCanvas} style={buttonStyle}>
          适应画布
        </button>
        <button type="button" disabled={disabled} onClick={onActualSize} style={buttonStyle}>
          100%
        </button>
      </div>

      <div role="group" aria-label="画布文件" style={groupStyle}>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          disabled={disabled}
          aria-label="选择画布 JSON 文件"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file !== undefined) void onImportFile(file)
          }}
        />
        <button
          type="button"
          data-testid="canvas-import"
          disabled={disabled}
          onClick={() => importInputRef.current?.click()}
          style={{ ...buttonStyle, borderColor: '#d0d5dd' }}
        >
          导入 JSON
        </button>
        <button
          type="button"
          data-testid="canvas-export"
          disabled={disabled}
          onClick={onExport}
          style={{ ...buttonStyle, borderColor: '#d0d5dd' }}
        >
          导出 JSON
        </button>
      </div>

      <div role="group" aria-label="渲染器" style={groupStyle}>
        <span style={{ color: '#667085', fontSize: 12 }}>渲染器</span>
        <span data-testid="active-renderer" style={{ color: '#101828', fontSize: 13, fontWeight: 600 }}>
          {active?.label ?? ''}
        </span>
        <button
          type="button"
          data-testid="renderer-switch"
          aria-label={`切换渲染器，当前 ${active?.label ?? ''}`}
          title={next === undefined ? undefined : `切换到 ${next.label}`}
          disabled={disabled || next === undefined}
          onClick={() => next !== undefined && onRendererChange(next.id)}
          style={{ ...buttonStyle, borderColor: '#d0d5dd', background: '#f9fafb' }}
        >
          切换
        </button>
      </div>

      <div role="group" aria-label="交互模式" style={groupStyle}>
        <span style={{ color: '#667085', fontSize: 12 }}>交互</span>
        <span
          data-testid="active-interaction-mode"
          style={{ color: '#101828', fontSize: 13, fontWeight: 600 }}
        >
          {interactionModeLabel}
        </span>
        <button
          type="button"
          data-testid="interaction-mode-switch"
          aria-label={`切换交互模式，当前 ${interactionModeLabel}`}
          title={`切换到${nextInteractionModeLabel}交互`}
          disabled={disabled}
          onClick={() => onInteractionModeChange(nextInteractionMode)}
          style={{ ...buttonStyle, borderColor: '#d0d5dd', background: '#f9fafb' }}
        >
          切换
        </button>
      </div>

      <div role="group" aria-label="帮助" style={groupStyle}>
        <button
          type="button"
          aria-label="打开快捷键帮助"
          aria-haspopup="dialog"
          title="键盘快捷键"
          onClick={onShowShortcuts}
          style={{ ...buttonStyle, minWidth: 32, padding: 0, borderColor: '#d0d5dd' }}
        >
          ?
        </button>
      </div>
    </div>
  )
}
