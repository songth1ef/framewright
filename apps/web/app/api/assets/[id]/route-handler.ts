import type { AssetContent } from '@framewright/server-core'
import { type IdRouteContext, jsonError, parseId } from '../../_shared/route-utils'

export interface AssetRouteService {
  getAssetContent(assetId: string): Promise<AssetContent | null>
  removeAsset(assetId: string): Promise<boolean>
}

export function createAssetRouteHandlers(service: AssetRouteService) {
  const parseAssetId = async (context: IdRouteContext) => parseId((await context.params).id)
  return {
    async GET(_request: Request, context: IdRouteContext): Promise<Response> {
      const assetId = await parseAssetId(context)
      if (assetId === null) return jsonError('invalid_asset_id', 400)
      try {
        const content = await service.getAssetContent(assetId)
        if (content === null) return jsonError('asset_not_found', 404)
        const body = content.data.buffer.slice(
          content.data.byteOffset,
          content.data.byteOffset + content.data.byteLength,
        ) as ArrayBuffer
        return new Response(body, {
          headers: {
            'Content-Type': content.asset.mimeType,
            'Content-Length': String(content.data.byteLength),
          },
        })
      } catch {
        return jsonError('internal_error', 500)
      }
    },

    async DELETE(_request: Request, context: IdRouteContext): Promise<Response> {
      const assetId = await parseAssetId(context)
      if (assetId === null) return jsonError('invalid_asset_id', 400)
      try {
        return await service.removeAsset(assetId)
          ? new Response(null, { status: 204 })
          : jsonError('asset_not_found', 404)
      } catch {
        return jsonError('internal_error', 500)
      }
    },
  }
}
