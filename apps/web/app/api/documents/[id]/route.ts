import { getDocument, saveDocument } from '@framewright/server-core'
import { createDocumentRouteHandlers } from './route-handler'

export const { GET, PUT } = createDocumentRouteHandlers({ getDocument, saveDocument })
