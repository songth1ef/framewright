import { appendMessage, listMessages } from '@framewright/server-core'
import { createSessionMessagesRouteHandlers } from './route-handler'

export const { GET, POST } = createSessionMessagesRouteHandlers({ listMessages, appendMessage })

