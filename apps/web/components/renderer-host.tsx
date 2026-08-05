'use client'

import {
  DEFAULT_VIEWPORT,
  applyOp,
  applySelection,
  createMemoryHistory,
  collectNodeIds,
  createDemoDocument,
  findNodeById,
  getContentBounds,
  isAiImageNode,
  isAiVideoNode,
  isFrameNode,
  walkTree,
  type CanvasNode,
  type CanvasOp,
  type FrameNode,
  type InboundRef,
  type NodeSlot,
  type RenderContext,
  type RendererAdapter,
  type RendererCallbacks,
} from '@framewright/core'
import { createDomRenderer } from '@framewright/renderer-dom'
import { createLeaferRenderer } from '@framewright/renderer-leafer'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DevPanelController, type DevPanelHandle } from './dev-panel'
import { EmptyCanvasGuide, ShortcutHelpDialog } from './canvas-overlays'
import { loadServerHistory } from './server-history'
import type { ServerHistory } from './server-history'
import {
  centerContentAtActualSize,
  fitContent,
  setActualSize,
  zoomViewport,
  type ViewportSize,
} from './viewport-actions'
import { ViewportToolbar } from './viewport-toolbar'
import { getViewportShortcut, isEditableTarget } from './viewport-shortcuts'

type Factory = () => RendererAdapter

/** 注册在这里的每一项都必须实现同一个 RendererAdapter，上层不做品牌分支判断。 */
const RENDERERS: ReadonlyArray<{ id: string; label: string; create: Factory }> = [
  { id: 'dom', label: 'HTML / DOM', create: createDomRenderer },
  { id: 'leafer', label: 'LeaferJS', create: createLeaferRenderer },
]

const DEV_PANEL_ENABLED = process.env.NODE_ENV !== 'production'

interface NodeLocation {
  node: CanvasNode
  slot: NodeSlot
}

function findNodeLocation(root: FrameNode, fwId: string): NodeLocation | null {
  const visit = (parent: FrameNode): NodeLocation | null => {
    for (const [index, node] of parent.children.entries()) {
      if (node.fwId === fwId) {
        return {
          node,
          slot: { parentFwId: parent.fwId, index, x: node.x, y: node.y },
        }
      }
      if (isFrameNode(node)) {
        const found = visit(node)
        if (found !== null) return found
      }
    }
    return null
  }
  return visit(root)
}

function collectInboundRefs(root: FrameNode, target: CanvasNode): InboundRef[] {
  const targetFwIds = new Set<string>()
  walkTree(target, (node) => targetFwIds.add(node.fwId))
  const refs: InboundRef[] = []
  walkTree(root, (node) => {
    if (targetFwIds.has(node.fwId) || (!isAiImageNode(node) && !isAiVideoNode(node))) return
    node.sourceFwIds.forEach((targetFwId, index) => {
      if (targetFwIds.has(targetFwId)) refs.push({ fwId: node.fwId, index, targetFwId })
    })
  })
  return refs
}

function groupOps(ops: readonly CanvasOp[]): CanvasOp | null {
  if (ops.length === 0) return null
  if (ops.length === 1) return ops[0]!
  return { kind: 'batch', ops: ops as Exclude<CanvasOp, { kind: 'batch' }>[] }
}

export function RendererHost({
  documentId,
  documentName,
  initialRoot,
}: {
  documentId?: string
  documentName?: string
  initialRoot?: FrameNode
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const adapterRef = useRef<RendererAdapter | null>(null)
  const devPanelRef = useRef<DevPanelHandle | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const getViewportSize = (): ViewportSize => ({
    width: containerRef.current?.clientWidth || 800,
    height: containerRef.current?.clientHeight || 450,
  })

  // 会话状态住在这里，不在渲染器内部——切换时原样传给新渲染器
  const [selection, setSelection] = useState<readonly string[]>(['box-front'])
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT)
  const [root, setRoot] = useState(() => initialRoot ?? createDemoDocument())
  const [lastAction, setLastAction] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [historyReady, setHistoryReady] = useState(documentId === undefined)
  const rootRef = useRef(root)
  const historyRef = useRef<ReturnType<typeof createMemoryHistory> | ServerHistory>(
    createMemoryHistory(),
  )
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveRevisionRef = useRef(0)
  const savedRootRef = useRef(root)
  const dirtyRef = useRef(false)
  const mountedRef = useRef(true)
  rootRef.current = root

  // U2：给了 documentId 就把操作栈换成写后端的版本，刷新后仍能撤销；加载失败退回内存栈
  useEffect(() => {
    if (documentId === undefined) return
    let cancelled = false
    loadServerHistory(documentId, {
      getRoot: () => rootRef.current,
      onError: (error) => console.error('[framewright] 操作日志写后端失败', error),
    })
      .then((history) => {
        if (!cancelled) {
          historyRef.current = history
          setHistoryReady(true)
        }
      })
      .catch((error: unknown) => {
        console.error('[framewright] 撤销历史加载失败，退回内存操作栈', error)
        if (!cancelled) setHistoryReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [documentId])

  const getHistorySeq = (): number => {
    const history = historyRef.current
    return 'getHistorySeq' in history ? history.getHistorySeq() : 0
  }

  const saveDocument = async (snapshot: FrameNode, revision: number): Promise<void> => {
    if (documentId === undefined || documentName === undefined) return
    const history = historyRef.current
    if ('flush' in history) await history.flush()
    const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: documentName, root: snapshot, historySeq: getHistorySeq() }),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    if (revision !== saveRevisionRef.current) return
    dirtyRef.current = false
    savedRootRef.current = snapshot
    if (mountedRef.current) setSaveStatus('saved')
  }

  useEffect(() => {
    if (documentId === undefined || documentName === undefined || root === savedRootRef.current) return
    dirtyRef.current = true
    const revision = saveRevisionRef.current + 1
    saveRevisionRef.current = revision
    setSaveStatus('saving')
    if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void saveDocument(root, revision).catch((error: unknown) => {
        console.error('[framewright] 自动保存失败', error)
        if (revision === saveRevisionRef.current && mountedRef.current) setSaveStatus('error')
      })
    }, 800)
  }, [documentId, documentName, root])

  useEffect(() => {
    mountedRef.current = true
    const flushPendingSave = (): void => {
      if (!dirtyRef.current || documentId === undefined || documentName === undefined) return
      dirtyRef.current = false
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      const history = historyRef.current
      if ('flush' in history) void history.flush()
      void fetch(`/api/documents/${encodeURIComponent(documentId)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: documentName,
          root: rootRef.current,
          historySeq: getHistorySeq(),
        }),
        keepalive: true,
      }).catch((error: unknown) => console.error('[framewright] 离开页面前保存失败', error))
    }

    window.addEventListener('pagehide', flushPendingSave)
    return () => {
      mountedRef.current = false
      window.removeEventListener('pagehide', flushPendingSave)
      flushPendingSave()
    }
  }, [documentId, documentName])

  const commitOps = (ops: readonly CanvasOp[]): void => {
    const op = groupOps(ops)
    if (op === null) return
    const next = applyOp(rootRef.current, op)
    historyRef.current.record(op)
    if (DEV_PANEL_ENABLED) devPanelRef.current?.record(op)
    rootRef.current = next
    setRoot(next)
  }

  const callbacks = useMemo<RendererCallbacks>(
    () => ({
      onSelectionRequest: (fwIds, mode) => {
        setSelection((current) => applySelection(current, fwIds, mode))
      },
      onNodesMove: (moves) => {
        const ops = moves.flatMap<CanvasOp>((move) => {
          const location = findNodeLocation(rootRef.current, move.fwId)
          if (location === null || location.slot.parentFwId !== move.parentFwId) return []
          return [{
            kind: 'move-node',
            fwId: move.fwId,
            from: location.slot,
            to: { ...location.slot, x: move.x, y: move.y },
          }]
        })
        commitOps(ops)
      },
      onNodesResize: (resizes) => {
        const ops = resizes.flatMap<CanvasOp>((resize) => {
          const node = findNodeById(rootRef.current, resize.fwId)
          if (node === null) return []
          return [{
            kind: 'update-node',
            fwId: resize.fwId,
            before: { x: node.x, y: node.y, width: node.width, height: node.height },
            after: {
              x: resize.x,
              y: resize.y,
              width: resize.width,
              height: resize.height,
            },
          }]
        })
        commitOps(ops)
      },
      onNodesDelete: (fwIds) => {
        let next = rootRef.current
        const ops: CanvasOp[] = []
        for (const fwId of fwIds) {
          const location = findNodeLocation(next, fwId)
          if (location === null || location.node.locked) continue
          const op: CanvasOp = {
            kind: 'remove-node',
            slot: location.slot,
            node: location.node,
            inboundRefs: collectInboundRefs(next, location.node),
          }
          next = applyOp(next, op)
          ops.push(op)
        }
        commitOps(ops)
        const remaining = new Set(collectNodeIds(rootRef.current))
        setSelection((current) => current.filter((fwId) => remaining.has(fwId)))
      },
      onViewportChange: setViewport,
      onNodeActivate: (fwId) => setLastAction(`${fwId}:activate`),
      onNodeAction: (fwId: string, action: string) => setLastAction(`${fwId}:${action}`),
    }),
    [],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) return

      const viewportShortcut = getViewportShortcut(event)
      if (viewportShortcut !== null) {
        event.preventDefault()
        const bounds = getContentBounds(rootRef.current)
        setViewport(
          viewportShortcut === 'fit-content'
            ? fitContent(bounds, getViewportSize())
            : centerContentAtActualSize(bounds, getViewportSize()),
        )
        return
      }

      if (!event.ctrlKey || event.key.toLowerCase() !== 'z') return

      const op = event.shiftKey ? historyRef.current.redo() : historyRef.current.undo()
      if (op === null) return
      event.preventDefault()
      const next = applyOp(rootRef.current, op)
      rootRef.current = next
      setRoot(next)
      const remaining = new Set(collectNodeIds(next))
      setSelection((current) => current.filter((fwId) => remaining.has(fwId)))
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const ctx: RenderContext = { root, selection, viewport, callbacks }
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx

  useEffect(() => {
    if (!historyReady) return
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
  }, [activeIndex, historyReady])

  useEffect(() => {
    queueMicrotask(() => adapterRef.current?.update(ctx))
  }, [ctx])

  const active = RENDERERS[activeIndex]
  const selectedNodes = selection.flatMap((fwId) => {
    const node = findNodeById(root, fwId)
    return node === null ? [] : [node]
  })
  return (
    <main
      data-testid="canvas-host"
      data-history-ready={String(historyReady)}
      style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}
    >
      <ViewportToolbar
        activeRendererId={active?.id ?? ''}
        renderers={RENDERERS}
        scale={viewport.scale}
        disabled={!historyReady}
        onRendererChange={(id) => {
          const index = RENDERERS.findIndex((renderer) => renderer.id === id)
          if (index >= 0) setActiveIndex(index)
        }}
        onZoomIn={() => setViewport((current) => zoomViewport(current, getViewportSize(), 1.1))}
        onZoomOut={() => setViewport((current) => zoomViewport(current, getViewportSize(), 1 / 1.1))}
        onFitCanvas={() =>
          setViewport(centerContentAtActualSize(getContentBounds(rootRef.current), getViewportSize()))
        }
        onActualSize={() => setViewport((current) => setActualSize(current, getViewportSize()))}
        onShowShortcuts={() => setShowShortcuts(true)}
      />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        {!historyReady ? <span role="status">正在加载撤销历史…</span> : null}
        {documentId === undefined || saveStatus === 'idle' ? null : (
          <span
            data-testid="save-status"
            role={saveStatus === 'error' ? 'alert' : 'status'}
            style={{ color: saveStatus === 'error' ? '#b42318' : '#475467' }}
          >
            {saveStatus === 'saving'
              ? '保存中…'
              : saveStatus === 'error'
                ? '保存失败，请重试'
                : '已保存'}
          </span>
        )}
        <button
          type="button"
          data-testid="select-box-back"
          disabled={!historyReady}
          onClick={() => setSelection(['box-back'])}
          style={{ padding: '6px 14px', cursor: 'pointer' }}
        >
          选中底层方块
        </button>
        <span data-testid="selection">{selection.join(',')}</span>
        <span>
          已选 <span data-testid="selection-count">{selection.length}</span> 个
        </span>
        <span>
          最近操作：<span data-testid="last-node-action">{lastAction}</span>
        </span>
        <button
          type="button"
          data-testid="toggle-inner-frame"
          disabled={!historyReady}
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

      <div style={{ position: 'relative', width: 800, height: 450 }}>
        <div
          ref={containerRef}
          data-testid="canvas-container"
          style={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            border: '1px solid #DDD',
            position: 'relative',
            boxSizing: 'border-box',
          }}
        />
        {historyReady && root.children.length === 0 ? <EmptyCanvasGuide /> : null}
      </div>
      {showShortcuts ? <ShortcutHelpDialog onClose={() => setShowShortcuts(false)} /> : null}
      {DEV_PANEL_ENABLED ? (
        <DevPanelController ref={devPanelRef} selectedNodes={selectedNodes} />
      ) : null}
    </main>
  )
}
