import { getProject, updateProject } from '@framewright/server-core'
import { createProjectRouteHandlers } from './route-handler'

export const { GET, PATCH } = createProjectRouteHandlers({ getProject, updateProject })

