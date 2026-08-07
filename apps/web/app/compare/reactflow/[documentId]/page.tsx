import { getDocument } from '@framewright/server-core'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ReactFlowPreview } from '@/components/reactflow-preview'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'React Flow 预览 · framewright' }

export default async function ReactFlowComparePage({
  params,
}: {
  params: Promise<{ documentId: string }>
}) {
  const { documentId } = await params
  const document = await getDocument(documentId)
  if (document === null) notFound()

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 style={{ fontSize: 20, margin: '0 0 12px' }}>React Flow 预览</h1>
        <Link href={`/canvas/${documentId}`} data-testid="back-to-canvas" style={{ fontSize: 13 }}>
          ← 回到画布（DOM / LeaferJS）
        </Link>
      </header>
      <ReactFlowPreview root={document.root} />
    </main>
  )
}
