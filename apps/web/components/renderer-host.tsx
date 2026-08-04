'use client'

import {
  DEFAULT_VIEWPORT,
  applyNodeMoves,
  applyNodeResizes,
  applySelection,
  collectNodeIds,
  createDemoDocument,
  deleteNodes,
  type RenderContext,
  type RendererAdapter,
  type RendererCallbacks,
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
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT)
  const [root, setRoot] = useState(createDemoDocument)
  const [lastAction, setLastAction] = useState('')
  const rootRef = useRef(root)
  rootRef.current = root

  const callbacks = useMemo<RendererCallbacks>(
    () => ({
      onSelectionRequest: (fwIds, mode) => {
        setSelection((current) => applySelection(current, fwIds, mode))
      },
      onNodesMove: (moves) => {
        setRoot((current) => {
          const next = applyNodeMoves(current, moves)
          rootRef.current = next
          return next
        })
      },
      onNodesResize: (resizes) => {
        setRoot((current) => {
          const next = applyNodeResizes(current, resizes)
          rootRef.current = next
          return next
        })
      },
      onNodesDelete: (fwIds) => {
        const next = deleteNodes(rootRef.current, fwIds)
        rootRef.current = next
        setRoot(next)
        const remaining = new Set(collectNodeIds(next))
        setSelection((current) => current.filter((fwId) => remaining.has(fwId)))
      },
      onViewportChange: setViewport,
      onNodeActivate: (fwId) => setLastAction(`${fwId}:activate`),
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
      <div
        data-testid="toolbar"
        style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}
      >
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
        <span>
          已选 <span data-testid="selection-count">{selection.length}</span> 个
        </span>
        <span data-testid="viewport-scale">{Math.round(viewport.scale * 100)}%</span>
        <span>
          最近操作：<span data-testid="last-node-action">{lastAction}</span>
        </span>
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
        style={{
          width: 800,
          height: 450,
          overflow: 'hidden',
          border: '1px solid #DDD',
          position: 'relative',
        }}
      />
    </main>
  )
}
