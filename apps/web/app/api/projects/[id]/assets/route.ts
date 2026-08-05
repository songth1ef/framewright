import { listProjectAssets, uploadAsset } from '@framewright/server-core'
import { createProjectAssetsRouteHandlers } from './route-handler'

export const { GET, POST } = createProjectAssetsRouteHandlers({ listProjectAssets, uploadAsset })
