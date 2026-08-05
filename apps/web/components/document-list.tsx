'use client'

import { createDemoDocument } from '@framewright/core'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  createCanvasDocument,
  deleteCanvasDocument,
  formatUpdatedAt,
  loadDocumentSummaries,
  renameCanvasDocument,
  type DocumentSummary,
} from './document-list-actions'
import { ScaleFixturePanel } from './scale-fixture-panel'

export function DocumentList({ documents: initialDocuments }: { documents: readonly DocumentSummary[] }) {
  const router = useRouter()
  const [documents, setDocuments] = useState<readonly DocumentSummary[]>(initialDocuments)
  const [creating, setCreating] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void loadDocumentSummaries()
      .then((loaded) => {
        if (active) setDocuments(loaded)
      })
      .catch(() => {
        // 服务端首屏数据仍可用；这里只补齐 updatedAt，不覆盖页面级错误。
      })
    return () => {
      active = false
    }
  }, [])

  const createCanvas = async (): Promise<void> => {
    const requestedName = window.prompt('给新画布命名', '未命名画布')
    if (requestedName === null) return
    const name = requestedName.trim()
    if (name.length === 0) {
      setError('画布名称不能为空')
      return
    }
    setCreating(true)
    setError('')
    try {
      const created = await createCanvasDocument(name, createDemoDocument())
      router.push(`/canvas/${encodeURIComponent(created.id)}`)
    } catch (cause) {
      setError(cause instanceof Error ? `新建失败：${cause.message}` : '新建失败')
      setCreating(false)
    }
  }

  const renameCanvas = async (document: DocumentSummary): Promise<void> => {
    const requestedName = window.prompt('重命名画布', document.name)
    if (requestedName === null) return
    const name = requestedName.trim()
    if (name.length === 0) {
      setError('画布名称不能为空')
      return
    }

    setPendingId(document.id)
    setError('')
    try {
      const updated = await renameCanvasDocument(document.id, name)
      setDocuments((current) => current.map((item) => item.id === document.id ? updated : item))
    } catch (cause) {
      setError(cause instanceof Error ? `重命名失败：${cause.message}` : '重命名失败')
    } finally {
      setPendingId(null)
    }
  }

  const deleteCanvas = async (document: DocumentSummary): Promise<void> => {
    if (!window.confirm(`确定删除画布“${document.name}”吗？此操作不可撤销。`)) return

    setPendingId(document.id)
    setError('')
    try {
      await deleteCanvasDocument(document.id)
      setDocuments((current) => current.filter((item) => item.id !== document.id))
    } catch (cause) {
      setError(cause instanceof Error ? `删除失败：${cause.message}` : '删除失败')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <section style={{ fontFamily: 'system-ui, sans-serif', padding: '24px 16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>画布工作台</h1>
        <button
          type="button"
          data-testid="create-document"
          disabled={creating}
          onClick={() => void createCanvas()}
        >
          {creating ? '正在新建…' : '新建画布'}
        </button>
      </div>
      <ScaleFixturePanel />
      {error === '' ? null : (
        <p role="alert" data-testid="document-list-error" style={{ color: '#b42318' }}>
          {error}
        </p>
      )}
      {documents.length === 0 ? (
        <p data-testid="empty-documents">还没有画布，点击“新建画布”开始。</p>
      ) : (
        <ul data-testid="document-list" style={{ display: 'grid', gap: 10, padding: 0, listStyle: 'none' }}>
          {documents.map((document) => (
            <li
              key={document.id}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: '1px solid #ddd', borderRadius: 8 }}
            >
              <div style={{ display: 'grid', gap: 4, flex: 1 }}>
                <Link href={`/canvas/${encodeURIComponent(document.id)}`}>{document.name}</Link>
                <small style={{ color: '#667085' }}>更新时间：{formatUpdatedAt(document.updatedAt)}</small>
              </div>
              <button
                type="button"
                data-testid={`rename-document-${document.id}`}
                disabled={pendingId === document.id}
                onClick={() => void renameCanvas(document)}
              >
                重命名
              </button>
              <button
                type="button"
                data-testid={`delete-document-${document.id}`}
                disabled={pendingId === document.id}
                onClick={() => void deleteCanvas(document)}
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
