import { MockGenerationProvider } from '@framewright/provider'
import { DEFAULT_LOCAL_ASSET_ROOT } from './asset-service'
import { createLocalAssetStorage } from './asset-storage'
import { createAssetStore } from './asset-store'
import { createGenerationService } from './generation-service'
import { createGenerationStore } from './generation-store'
import { prisma } from './prisma'

interface GenerationCompositionGlobal {
  __framewrightDefaultGenerationService?: ReturnType<typeof createGenerationService>
}

/**
 * 默认生成链路的唯一组装点。生产 Route Handler 只调用下方导出的函数；
 * 将来接真实厂商时只需在这里替换 provider，工厂仍可供测试与自定义组装使用。
 *
 * Next 会把不同 Route Handler 编成独立 bundle；进程级缓存保证内存 mock 的任务
 * 与 generation→taskId 映射能跨 bundle 共享，也避免开发热更新重复创建默认实例。
 */
const compositionGlobal = globalThis as typeof globalThis & GenerationCompositionGlobal
const defaultGenerationService =
  compositionGlobal.__framewrightDefaultGenerationService ??
  createGenerationService({
    provider: new MockGenerationProvider(),
    generationStore: createGenerationStore(prisma),
    assetStore: createAssetStore(prisma),
    storage: createLocalAssetStorage({ rootDir: DEFAULT_LOCAL_ASSET_ROOT }),
  })

compositionGlobal.__framewrightDefaultGenerationService = defaultGenerationService

export const submitGeneration = defaultGenerationService.submitGeneration
export const pollGeneration = defaultGenerationService.pollGeneration
