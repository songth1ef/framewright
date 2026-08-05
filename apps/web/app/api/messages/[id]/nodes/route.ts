import { linkNodeFwIds } from '@framewright/server-core'
import { createMessageNodesRouteHandlers } from './route-handler'

export const { POST } = createMessageNodesRouteHandlers({ linkNodeFwIds })

