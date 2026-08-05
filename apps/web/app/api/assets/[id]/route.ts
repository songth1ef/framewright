import { getAssetContent, removeAsset } from '@framewright/server-core'
import { createAssetRouteHandlers } from './route-handler'

export const { GET, DELETE } = createAssetRouteHandlers({ getAssetContent, removeAsset })
