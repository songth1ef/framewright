'use client'

import { createDemoDocument } from '@framewright/core'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface DocumentSummary {
  id: string
  name: string
}

export function DocumentList({ documents }: { documents: readonly DocumentSummary[] }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const createCanvas = async (): Promise<void> => {
    setCreating(true)
    setError('')
    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: '未命名画布', root: createDemoDocument() }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const created = (await response.json()) as DocumentSummary
      router.push(`/canvas/${encodeURIComponent(created.id)}`)
    } catch (cause) {
      setError(cause instanceof Error ? `新建失败：${cause.message}` : '新建失败')
      setCreating(false)
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
      {error === '' ? null : (
        <p role="alert" data-testid="create-document-error" style={{ color: '#b42318' }}>
          {error}
        </p>
      )}
      {documents.length === 0 ? (
        <p data-testid="empty-documents">还没有画布，点击“新建画布”开始。</p>
      ) : (
        <ul data-testid="document-list">
          {documents.map((document) => (
            <li key={document.id}>
              <Link href={`/canvas/${encodeURIComponent(document.id)}`}>{document.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
