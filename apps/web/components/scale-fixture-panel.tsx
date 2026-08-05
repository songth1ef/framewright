'use client'

import type { ScaleFixtureConnectionPattern } from '@framewright/core'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createScaleFixtureCanvas, formatPayloadSize } from './scale-fixture-actions'
import {
  DEFAULT_SCALE_FIXTURE_PARAMS,
  SCALE_FIXTURE_CONNECTION_PATTERNS,
  SCALE_FIXTURE_NODE_COUNT_OPTIONS,
  readStoredScaleFixtureParams,
  writeStoredScaleFixtureParams,
  type ScaleFixtureNodeCount,
  type ScaleFixtureParams,
} from './scale-fixture-storage'

const CONNECTION_PATTERN_LABELS: Record<ScaleFixtureConnectionPattern, string> = {
  none: '无连线',
  fanin: '汇聚（fanin）',
  distributed: '逐级衍生（distributed）',
  'many-to-many': '多对多（many-to-many）',
}

/** 一万节点实测：上传约 1 秒、画布首次打开约 5.7 秒。入口必须提前说明，否则用户会以为页面坏了。 */
const LARGE_CANVAS_HINT = '提示：一万节点的画布上传与首次打开各需几秒，请耐心等待，页面没有卡死。'

/**
 * 大数据量生成入口：选节点数与连线形态，用 core 的 createScaleFixture 生成一份
 * 确定性画布，建成新文档后跳转过去。参数记忆走 localStorage（见 scale-fixture-storage）。
 */
export function ScaleFixturePanel() {
  const router = useRouter()
  // 首帧必须用默认值：localStorage 只在挂载后读取，否则服务端与客户端渲染不一致。
  const [params, setParams] = useState<ScaleFixtureParams>(DEFAULT_SCALE_FIXTURE_PARAMS)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setParams(readStoredScaleFixtureParams())
  }, [])

  const updateParams = (next: ScaleFixtureParams): void => {
    setParams(next)
    writeStoredScaleFixtureParams(next)
  }

  const generate = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const created = await createScaleFixtureCanvas(params, (stage) => {
        if (stage.kind === 'generating') {
          setStatus(`正在生成 ${params.nodeCount} 个节点…`)
        } else if (stage.kind === 'uploading') {
          setStatus(`已生成（约 ${formatPayloadSize(stage.payloadBytes)}），正在上传，大画布需要几秒钟…`)
        } else {
          setStatus('创建成功，正在打开新画布…')
        }
      })
      router.push(`/canvas/${encodeURIComponent(created.id)}`)
    } catch (cause) {
      setError(cause instanceof Error ? `生成失败：${cause.message}` : '生成失败')
      setStatus('')
      setBusy(false)
    }
  }

  return (
    <section
      data-testid="scale-fixture-panel"
      style={{ marginTop: 16, padding: 12, border: '1px solid #ddd', borderRadius: 8, display: 'grid', gap: 8, maxWidth: 560 }}
    >
      <strong>大数据量测试</strong>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          节点数
          <select
            aria-label="节点数"
            data-testid="scale-fixture-node-count"
            disabled={busy}
            value={params.nodeCount}
            onChange={(event) => {
              updateParams({ ...params, nodeCount: Number(event.target.value) as ScaleFixtureNodeCount })
            }}
          >
            {SCALE_FIXTURE_NODE_COUNT_OPTIONS.map((count) => (
              <option key={count} value={count}>{count}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          连线形态
          <select
            aria-label="连线形态"
            data-testid="scale-fixture-connection-pattern"
            disabled={busy}
            value={params.connectionPattern}
            onChange={(event) => {
              updateParams({ ...params, connectionPattern: event.target.value as ScaleFixtureConnectionPattern })
            }}
          >
            {SCALE_FIXTURE_CONNECTION_PATTERNS.map((pattern) => (
              <option key={pattern} value={pattern}>{CONNECTION_PATTERN_LABELS[pattern]}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          data-testid="generate-scale-fixture"
          disabled={busy}
          onClick={() => void generate()}
        >
          {busy ? '正在生成…' : '生成测试画布'}
        </button>
      </div>
      {params.nodeCount < 10000 ? null : (
        <small data-testid="scale-fixture-large-hint" style={{ color: '#9a6700' }}>{LARGE_CANVAS_HINT}</small>
      )}
      {status === '' ? null : (
        <p role="status" data-testid="scale-fixture-status" style={{ margin: 0, color: '#175cd3' }}>{status}</p>
      )}
      {error === '' ? null : (
        <p role="alert" data-testid="scale-fixture-error" style={{ margin: 0, color: '#b42318' }}>{error}</p>
      )}
    </section>
  )
}
