import { getMessage } from '@framewright/server-core'
import { createMessageRouteHandlers } from './route-handler'

export const { GET } = createMessageRouteHandlers({ getMessage })

