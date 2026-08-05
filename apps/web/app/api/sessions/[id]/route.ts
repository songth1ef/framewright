import { deleteSession, getSession, renameSession } from '@framewright/server-core'
import { createSessionRouteHandlers } from './route-handler'

export const { GET, PATCH, DELETE } = createSessionRouteHandlers({ getSession, renameSession, deleteSession })

