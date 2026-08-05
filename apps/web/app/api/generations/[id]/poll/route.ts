import { pollGeneration } from '@framewright/server-core'
import { createGenerationPollRouteHandlers } from '../../route-handler'

export const { POST } = createGenerationPollRouteHandlers({ pollGeneration })
