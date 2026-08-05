import { getDocument, submitGeneration } from '@framewright/server-core'
import { createGenerationsRouteHandlers } from './route-handler'

export const { POST } = createGenerationsRouteHandlers({ getDocument, submitGeneration })
