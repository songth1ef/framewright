'use client'

import {
  DEFAULT_VIEWPORT,
  NOOP_RENDERER_CALLBACKS,
  createDemoDocument,
  type RenderContext,
  type RendererAdapter,
} from '@framewright/core'
import { createDomRenderer } from '@framewright/renderer-dom'
import { createLeaferRenderer } from '@framewright/renderer-leafer'
import { useEffect, useMemo, useRef, useState } from 'react'

type Factory = () => RendererAdapter

/** 注册在这里的每一项都必须实现同一个 RendererAdapter，上层不做品牌分支判断。 */
const RENDERERS: ReadonlyArray<{ id: string; label: string; create: Factory }> = [
  { id: 'dom', label: 'HTML / DOM', create: createDomRenderer },
  { id: 'leafer', label: 'LeaferJS', create: createLeaferRenderer },
]

export function RendererHost() {
  const containerRef = useRef<HTMLDivElement>(null)
  const adapterRef = useRef<RendererAdapter | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  // 会话状态住在这里，不在渲染器内部——切换时原样传给新渲染器
  const [selection, setSelection] = useState<readonly string[]>(['box-front'])
  const [viewport] = useState(DEFAULT_VIEWPORT)
  const [root, setRoot] = useState(createDemoDocument)
  const [lastAction, setLastAction] = useState('')

  const callbacks = useMemo(
    () => ({
      ...NOOP_RENDERER_CALLBACKS,
      onNodeAction: (fwId: string, action: string) => setLastAction(`${fwId}:${action}`),
    }),
    [],
  )

  const ctx: RenderContext = { root, selection, viewport, callbacks }
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return
    const entry = RENDERERS[activeIndex]
    if (entry === undefined) return
    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) return
      const adapter = entry.create()
      adapterRef.current = adapter
      adapter.mount(container, ctxRef.current)
      ;(window as unknown as Record<string, unknown>)['__fwGetBounds'] = () =>
        Object.fromEntries(adapter.getRenderedBounds())
      ;(window as unknown as Record<string, unknown>)['__fwGetVisible'] = () =>
        adapter.getVisibleNodeIds()
    })

    return () => {
      cancelled = true
      const adapter = adapterRef.current
      if (adapter === null) return
      adapterRef.current = null
      queueMicrotask(() => adapter.destroy())
      delete (window as unknown as Record<string, unknown>)['__fwGetBounds']
      delete (window as unknown as Record<string, unknown>)['__fwGetVisible']
    }
  }, [activeIndex])

  useEffect(() => {
    queueMicrotask(() => adapterRef.current?.update(ctx))
  }, [ctx])

  const active = RENDERERS[activeIndex]

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <button
          type="button"
          data-testid="renderer-switch"
          onClick={() => setActiveIndex((i) => (i + 1) % RENDERERS.length)}
          style={{ padding: '6px 14px', cursor: 'pointer' }}
        >
          切换渲染器
        </button>
        <span data-testid="active-renderer">{active?.label ?? ''}</span>
        <button
          type="button"
          data-testid="select-box-back"
          onClick={() => setSelection(['box-back'])}
          style={{ padding: '6px 14px', cursor: 'pointer' }}
        >
          选中底层方块
        </button>
        <span data-testid="selection">{selection.join(',')}</span>
        <span data-testid="last-node-action">{lastAction}</span>
        <button
          type="button"
          data-testid="toggle-inner-frame"
          onClick={() =>
            setRoot((current) => ({
              ...current,
              children: current.children.map((node) =>
                node.fwId === 'inner-frame' ? { ...node, visible: !node.visible } : node,
              ),
            }))
          }
          style={{ padding: '6px 14px', cursor: 'pointer' }}
        >
          切换内层画框可见性
        </button>
      </div>

      <div
        ref={containerRef}
        data-testid="canvas-container"
        style={{ width: 800, height: 450, border: '1px solid #DDD', position: 'relative' }}
      />
    </main>
  )
}
