'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import {
  FPS_MONITOR_STORAGE_KEY,
  createFpsSampler,
  readFpsMonitorPreference,
} from './fps-monitor'

const panelStyle: CSSProperties = {
  position: 'fixed',
  bottom: 12,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 9px',
  border: '1px solid #344054',
  borderRadius: 6,
  background: 'rgba(16, 24, 40, 0.9)',
  color: '#f2f4f7',
  font: '12px ui-monospace, SFMono-Regular, Consolas, monospace',
}

const buttonStyle: CSSProperties = {
  border: '1px solid #667085',
  borderRadius: 4,
  padding: '3px 7px',
  background: '#344054',
  color: '#fff',
  cursor: 'pointer',
  font: '12px system-ui, sans-serif',
}

export function FpsMonitor({ totalNodeCount }: { totalNodeCount: number }): ReactElement {
  const [enabled, setEnabled] = useState(false)
  const metricsRef = useRef<HTMLSpanElement>(null)
  const totalNodeCountRef = useRef(totalNodeCount)
  totalNodeCountRef.current = totalNodeCount

  useEffect(() => {
    if (readFpsMonitorPreference(window.localStorage)) setEnabled(true)
  }, [])

  useEffect(() => {
    if (!enabled) return
    let animationFrameId = 0
    const sampler = createFpsSampler(({ fps, minimumFps, longFrames }) => {
      const metrics = metricsRef.current
      if (metrics === null) return
      metrics.textContent =
        `FPS ${fps} · 最低 ${minimumFps} · 长帧 ${longFrames} · ` +
        `节点 ${totalNodeCountRef.current} / 挂载 —`
    })
    const onAnimationFrame = (timestamp: number): void => {
      sampler.recordFrame(timestamp)
      animationFrameId = requestAnimationFrame(onAnimationFrame)
    }
    animationFrameId = requestAnimationFrame(onAnimationFrame)
    return () => cancelAnimationFrame(animationFrameId)
  }, [enabled])

  const toggle = (): void => {
    setEnabled((current) => {
      const next = !current
      try {
        window.localStorage.setItem(FPS_MONITOR_STORAGE_KEY, String(next))
      } catch {
        // 隐私模式或存储配额错误不应影响监控器本身。
      }
      return next
    })
  }

  if (!enabled) {
    return (
      <button type="button" data-testid="fps-monitor-toggle" style={panelStyle} onClick={toggle}>
        FPS
      </button>
    )
  }

  return (
    <aside data-testid="fps-monitor" style={panelStyle} aria-label="画布性能监控">
      <span ref={metricsRef} data-testid="fps-monitor-metrics">
        FPS — · 最低 — · 长帧 0 · 节点 {totalNodeCount} / 挂载 —
      </span>
      <button type="button" data-testid="fps-monitor-toggle" style={buttonStyle} onClick={toggle}>
        关闭
      </button>
    </aside>
  )
}
