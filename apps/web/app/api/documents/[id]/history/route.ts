import { appendOp, getEntries } from '@framewright/server-core'
import { createHistoryRouteHandlers } from './route-handler'

export const { GET, POST } = createHistoryRouteHandlers({
  getHistory: getEntries,
  appendHistory: appendOp,
})
