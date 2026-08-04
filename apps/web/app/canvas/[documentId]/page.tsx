import { getDocument } from '@framewright/server-core'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CanvasClient } from '@/components/canvas-client'

export const dynamic = 'force-dynamic'

export default async function CanvasPage({
  params,
}: {
  params: Promise<{ documentId: string }>
}) {
  const { documentId } = await params
  const document = await getDocument(documentId)
  if (document === null) notFound()

  return (
    <>
      <header style={{ fontFamily: 'system-ui, sans-serif', padding: '16px 16px 0' }}>
        <Link href="/">← 返回画布列表</Link>
        <h1 data-testid="document-name" style={{ fontSize: 20 }}>
          {document.name}
        </h1>
      </header>
      <CanvasClient documentId={document.id} initialRoot={document.root} />
    </>
  )
}
