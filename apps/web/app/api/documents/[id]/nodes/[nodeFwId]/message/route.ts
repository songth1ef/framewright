import { findMessageByNodeFwId } from '@framewright/server-core'
import { createNodeMessageRouteHandlers } from './route-handler'

export const { GET } = createNodeMessageRouteHandlers({ findMessageByNodeFwId })

