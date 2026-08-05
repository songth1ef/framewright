import { linkGenerations } from '@framewright/server-core'
import { createMessageGenerationsRouteHandlers } from './route-handler'

export const { POST } = createMessageGenerationsRouteHandlers({ linkGenerations })

