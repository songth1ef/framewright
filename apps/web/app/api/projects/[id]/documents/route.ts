import { listProjectDocuments } from '@framewright/server-core'
import { createProjectDocumentsRouteHandlers } from './route-handler'

export const { GET } = createProjectDocumentsRouteHandlers({ listProjectDocuments })

