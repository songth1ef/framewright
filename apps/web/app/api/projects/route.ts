import { createProject, listProjects } from '@framewright/server-core'
import { createProjectsRouteHandlers } from './route-handler'

export const { GET, POST } = createProjectsRouteHandlers({ listProjects, createProject })

