import { deleteDocument, getDocument, renameDocument, saveDocument } from '@framewright/server-core'
import { createDocumentRouteHandlers } from './route-handler'

export const { GET, PUT, DELETE } = createDocumentRouteHandlers({
  getDocument,
  saveDocument,
  renameDocument,
  deleteDocument,
})
