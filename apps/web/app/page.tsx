import { listDocuments } from '@framewright/server-core'
import { CanvasClient } from '@/components/canvas-client'
import { DocumentList } from '@/components/document-list'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const documents = await listDocuments()

  return (
    <>
      <DocumentList documents={documents.map(({ id, name }) => ({ id, name }))} />
      <CanvasClient />
    </>
  )
}
