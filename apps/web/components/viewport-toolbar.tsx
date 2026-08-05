import type { CSSProperties } from 'react'

interface RendererOption {
  id: string
  label: string
}

interface ViewportToolbarProps {
  activeRendererId: string
  renderers: readonly RendererOption[]
  scale: number
  disabled: boolean
  onRendererChange(id: string): void
  onZoomIn(): void
  onZoomOut(): void
  onFitCanvas(): void
  onActualSize(): void
}

const toolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
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
  scale,
  disabled,
  onRendererChange,
  onZoomIn,
  onZoomOut,
  onFitCanvas,
  onActualSize,
}: ViewportToolbarProps) {
  const activeIndex = renderers.findIndex((renderer) => renderer.id === activeRendererId)
  const active = renderers[activeIndex]
  const next = renderers[(activeIndex + 1) % renderers.length]

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
    </div>
  )
}
