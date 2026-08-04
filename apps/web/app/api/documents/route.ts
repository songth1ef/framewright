import { createDocument, listDocuments } from '@framewright/server-core'
import { createDocumentsRouteHandlers } from './route-handler'

export const { GET, POST } = createDocumentsRouteHandlers({ listDocuments, createDocument })
