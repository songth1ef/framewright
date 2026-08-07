'use client'

/**
 * React Flow 只读预览。
 *
 * 🔴 定位：**实验性预览，不是第三个生产渲染器。**
 * `architecture.md` §8.9 起 React Flow 一直只是测量探针，不进 `RENDERERS` 注册表。
 * 把它做成独立路由而不是加进主画布，是为了避开 `AGENTS.md` 的铁律 ——
 * 「只在一个渲染器里实现某功能」属禁止项，真要升格就得每个功能写三遍。
 *
 * 这里只做「看得见、能对比」，不接交互、不接 LOD、不接撤销。
 *
 * ⚠️ 保留 React Flow 的 attribution 水印。官方只说过「订阅 Pro 后**允许移除**」，
 * 从没说过不订阅也能移除 —— 所以**保留它是 MIT 下完全合规的**，
 * 灰区只存在于移除这个动作上。见 `docs/research/2026-08-04-ready-made-libs.md`。
 *
 * 性能上的关键前提（实测，见 §8.9.2）：**必须在外层先裁剪再喂给它**。
 * 整棵树交给 React Flow，它每帧对全部节点做 O(N) 判定 ——
 * 1000 节点时 3.2fps，先裁剪则 60.0fps，差 18.75 倍。
 * 所以这里开着 `preCull`。
 */
import { NOOP_RENDERER_CALLBACKS, type FrameNode, type RendererAdapter } from '@framewright/core'
import { createReactFlowProbeRenderer } from '@framewright/renderer-reactflow'
import { useEffect, useRef, useState } from 'react'

export function ReactFlowPreview({ root }: { root: FrameNode }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const adapterRef = useRef<RendererAdapter | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [nodeCount, setNodeCount] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return
    const observer = new ResizeObserver(() => {
      setSize({ width: container.clientWidth, height: container.clientHeight })
    })
    observer.observe(container)
    setSize({ width: container.clientWidth, height: container.clientHeight })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const container = containerRef.current
    // 尺寸未测量到就先不挂载：预裁剪要靠它算可见区，0×0 会退化成「不裁剪」，
    // 而不裁剪正是 React Flow 掉到 3fps 的原因（§8.9.2）。
    if (container === null || size.width <= 0 || size.height <= 0) return

    const adapter = createReactFlowProbeRenderer({ preCull: true, onlyRenderVisibleElements: false })
    adapterRef.current = adapter
    adapter.mount(container, {
      root,
      selection: [],
      viewport: { scale: 1, offsetX: 0, offsetY: 0 },
      viewportSize: size,
      callbacks: NOOP_RENDERER_CALLBACKS,
    })
    setNodeCount(adapter.getVisibleNodeIds().length)
    return () => {
      adapter.destroy()
      adapterRef.current = null
    }
  }, [root, size])

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div
        data-testid="reactflow-preview-notice"
        style={{
          background: '#FFF7E6', border: '1px solid #FFD591', borderRadius: 8,
          padding: '10px 12px', margin: '0 0 12px', fontSize: 13, lineHeight: 1.6,
        }}
      >
        <strong>实验性预览 · 无交互</strong>
        <div style={{ color: '#5A5A66' }}>
          React Flow 在本项目里是<strong>测量探针</strong>，不是生产渲染器。此页仅用于
          肉眼对比渲染效果，不支持拖拽、框选、缩放与撤销。
          左下角的 React Flow 水印按其许可保留。
        </div>
      </div>
      <div
        ref={containerRef}
        data-testid="reactflow-preview-canvas"
        style={{ position: 'relative', width: '100%', height: '70vh', border: '1px solid #E4E4EA', borderRadius: 8, overflow: 'hidden' }}
      />
      <p data-testid="reactflow-preview-stats" style={{ fontSize: 12, color: '#5A5A66' }}>
        容器 {size.width}×{size.height} · 文档节点 {nodeCount} 个 ·
        已启用外层视口裁剪（不启用时 1000 节点实测仅 3.2fps，见 architecture.md §8.9.2）
      </p>
    </div>
  )
}
