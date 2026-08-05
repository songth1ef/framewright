import { createSession, listProjectSessions } from '@framewright/server-core'
import { createProjectSessionsRouteHandlers } from './route-handler'

export const { GET, POST } = createProjectSessionsRouteHandlers({ listProjectSessions, createSession })

