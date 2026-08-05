import {
  createAudioNode,
  createAiImageNode,
  createAiVideoNode,
  createFrameNode,
  createImgNode,
  createVideoNode,
  type CanvasNode,
  type FrameNode,
} from './node-schema'
import {
  PUBLIC_AUDIO_ASSETS,
  PUBLIC_IMAGE_ASSETS,
  PUBLIC_VIDEO_ASSETS,
  type PublicImageAsset,
  type PublicVideoAsset,
} from './demo-media'

export const SCALE_FIXTURE_NODE_TYPES = ['img', 'video', 'audio', 'ai-image', 'ai-video'] as const
export type ScaleFixtureNodeType = (typeof SCALE_FIXTURE_NODE_TYPES)[number]
export type ScaleFixtureConnectionPattern = 'none' | 'fanin' | 'distributed' | 'many-to-many'
export type ScaleFixtureSeed = number | string

export interface ScaleFixtureOptions {
  /** 画布内素材节点数；返回值的 root frame 不计入。 */
  nodeCount: number
  connectionPattern: ScaleFixtureConnectionPattern
  seed: ScaleFixtureSeed
  /** 五种素材的相对权重。传入时未列出的类型权重视为 0。 */
  typeRatios?: Partial<Record<ScaleFixtureNodeType, number>>
  /** many-to-many 的每组结构：M 个素材 → K 个 v1 → K 个 v2。 */
  manyToMany?: {
    sourceCount?: number
    productCount?: number
  }
}

const DEFAULT_TYPE_RATIOS: Record<ScaleFixtureNodeType, number> = {
  img: 3,
  video: 1,
  audio: 1,
  'ai-image': 4,
  'ai-video': 2,
}

const NODE_CELL_WIDTH = 160
const NODE_CELL_HEIGHT = 100
const COLUMN_GAP = 40
const ROW_GAP = 60
const CANVAS_PADDING = 40

interface Topology {
  forcedGenerated: Uint8Array
  sourcesByIndex: Array<string[] | undefined>
}

function normalizeSeed(seed: ScaleFixtureSeed): number {
  if (typeof seed === 'number') {
    if (!Number.isFinite(seed)) throw new RangeError('seed 必须是有限数字或字符串')
    return seed >>> 0
  }

  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** Mulberry32：固定 32-bit 运算保证不同 JS 运行环境给出相同序列。 */
function createSeededRandom(seed: ScaleFixtureSeed): () => number {
  let state = normalizeSeed(seed)
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} 必须是非负安全整数`)
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} 必须是正安全整数`)
  }
}

function allocateTypeCounts(
  nodeCount: number,
  configuredRatios: ScaleFixtureOptions['typeRatios'],
): Record<ScaleFixtureNodeType, number> {
  const ratios = configuredRatios ?? DEFAULT_TYPE_RATIOS
  const weights = SCALE_FIXTURE_NODE_TYPES.map((type) => ratios[type] ?? 0)
  for (const weight of weights) {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new RangeError('typeRatios 的权重必须是非负有限数字')
    }
  }
  const totalWeight = weights.reduce((total, weight) => total + weight, 0)
  if (totalWeight <= 0) throw new RangeError('typeRatios 至少要有一个正权重')

  const exactCounts = weights.map((weight) => (nodeCount * weight) / totalWeight)
  const counts = exactCounts.map(Math.floor)
  let remainder = nodeCount - counts.reduce((total, count) => total + count, 0)
  const remainderOrder = exactCounts
    .map((exact, index) => ({ index, fraction: exact - Math.floor(exact) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index)
  for (let index = 0; index < remainder; index += 1) {
    const slot = remainderOrder[index]
    if (slot) counts[slot.index] = (counts[slot.index] ?? 0) + 1
  }

  return {
    img: counts[0] ?? 0,
    video: counts[1] ?? 0,
    audio: counts[2] ?? 0,
    'ai-image': counts[3] ?? 0,
    'ai-video': counts[4] ?? 0,
  }
}

function nodeId(index: number): string {
  return `scale-node-${index}`
}

function pickAsset<T>(assets: readonly T[], random: () => number): T {
  const asset = assets[Math.floor(random() * assets.length)]
  if (!asset) throw new Error('规模夹具素材列表不能为空')
  return asset
}

function fitNodeSize(sourceWidth: number, sourceHeight: number): { width: number; height: number } {
  const scale = Math.min(NODE_CELL_WIDTH / sourceWidth, NODE_CELL_HEIGHT / sourceHeight)
  return {
    width: Math.round(sourceWidth * scale * 1_000) / 1_000,
    height: Math.round(sourceHeight * scale * 1_000) / 1_000,
  }
}

function createTopology(options: ScaleFixtureOptions): Topology {
  const { nodeCount, connectionPattern } = options
  const forcedGenerated = new Uint8Array(nodeCount)
  const sourcesByIndex: Array<string[] | undefined> = new Array(nodeCount)

  if (connectionPattern === 'fanin' && nodeCount > 1) {
    const targetIndex = nodeCount - 1
    forcedGenerated[targetIndex] = 1
    const sources = new Array<string>(targetIndex)
    for (let index = 0; index < targetIndex; index += 1) sources[index] = nodeId(index)
    sourcesByIndex[targetIndex] = sources
  }

  if (connectionPattern === 'many-to-many') {
    const sourceCount = options.manyToMany?.sourceCount ?? 5
    const productCount = options.manyToMany?.productCount ?? 2
    assertPositiveInteger(sourceCount, 'manyToMany.sourceCount')
    assertPositiveInteger(productCount, 'manyToMany.productCount')
    const blockSize = sourceCount + productCount * 2

    for (let offset = 0; offset < nodeCount; offset += blockSize) {
      const sourceEnd = Math.min(offset + sourceCount, nodeCount)
      const v1End = Math.min(sourceEnd + productCount, nodeCount)
      const v2End = Math.min(v1End + productCount, nodeCount)
      const sourceIds: string[] = []
      const v1Ids: string[] = []
      for (let index = offset; index < sourceEnd; index += 1) sourceIds.push(nodeId(index))
      for (let index = sourceEnd; index < v1End; index += 1) v1Ids.push(nodeId(index))

      for (let index = sourceEnd; index < v1End; index += 1) {
        forcedGenerated[index] = 1
        sourcesByIndex[index] = sourceIds.slice()
      }
      for (let index = v1End; index < v2End; index += 1) {
        forcedGenerated[index] = 1
        const supplementalSource = sourceIds[(index - v1End) % sourceIds.length]
        sourcesByIndex[index] = supplementalSource ? [...v1Ids, supplementalSource] : v1Ids.slice()
      }
    }
  }

  return { forcedGenerated, sourcesByIndex }
}

function assignTypes(
  nodeCount: number,
  counts: Record<ScaleFixtureNodeType, number>,
  forcedGenerated: Uint8Array,
  random: () => number,
): ScaleFixtureNodeType[] {
  const types = new Array<ScaleFixtureNodeType>(nodeCount)
  let forcedCount = 0
  for (const forced of forcedGenerated) forcedCount += forced
  let aiImageRemaining = counts['ai-image']
  let aiVideoRemaining = counts['ai-video']
  if (aiImageRemaining + aiVideoRemaining < forcedCount) {
    throw new RangeError('当前 typeRatios 的 AI 素材数量不足以承载所选连线形态')
  }

  for (let index = 0; index < nodeCount; index += 1) {
    if (!forcedGenerated[index]) continue
    const aiTotal = aiImageRemaining + aiVideoRemaining
    const type = random() * aiTotal < aiImageRemaining ? 'ai-image' : 'ai-video'
    types[index] = type
    if (type === 'ai-image') aiImageRemaining -= 1
    else aiVideoRemaining -= 1
  }

  const remainingTypes: ScaleFixtureNodeType[] = []
  const remainingCounts: Record<ScaleFixtureNodeType, number> = {
    img: counts.img,
    video: counts.video,
    audio: counts.audio,
    'ai-image': aiImageRemaining,
    'ai-video': aiVideoRemaining,
  }
  for (const type of SCALE_FIXTURE_NODE_TYPES) {
    for (let count = 0; count < remainingCounts[type]; count += 1) remainingTypes.push(type)
  }
  for (let index = remainingTypes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const value = remainingTypes[index]
    remainingTypes[index] = remainingTypes[swapIndex]!
    remainingTypes[swapIndex] = value!
  }
  let remainingIndex = 0
  for (let index = 0; index < nodeCount; index += 1) {
    if (!forcedGenerated[index]) types[index] = remainingTypes[remainingIndex++]!
  }
  return types
}

function createMaterialNode(
  type: ScaleFixtureNodeType,
  index: number,
  x: number,
  y: number,
  seed: ScaleFixtureSeed,
  sourceFwIds: string[],
  random: () => number,
): CanvasNode {
  if (type === 'audio') {
    const audioAsset = pickAsset(PUBLIC_AUDIO_ASSETS, random)
    return createAudioNode({
      fwId: nodeId(index),
      name: `规模夹具 ${index + 1} · ${audioAsset.id}`,
      x,
      y,
      width: NODE_CELL_WIDTH,
      height: NODE_CELL_HEIGHT,
      src: audioAsset.url,
    })
  }
  const imageAsset: PublicImageAsset | undefined =
    type === 'img' || type === 'ai-image' ? pickAsset(PUBLIC_IMAGE_ASSETS, random) : undefined
  const videoAsset: PublicVideoAsset | undefined =
    type === 'video' || type === 'ai-video' ? pickAsset(PUBLIC_VIDEO_ASSETS, random) : undefined
  const primaryAsset = imageAsset ?? videoAsset
  if (!primaryAsset) throw new Error(`规模夹具不支持素材类型 ${type}`)
  const size = fitNodeSize(primaryAsset.width, primaryAsset.height)
  const base = {
    fwId: nodeId(index),
    name: `规模夹具 ${index + 1}`,
    x,
    y,
    width: size.width,
    height: size.height,
  }
  if (type === 'img') return createImgNode({ ...base, src: imageAsset!.url, fit: 'cover' })
  if (type === 'video') {
    const poster = pickAsset(PUBLIC_IMAGE_ASSETS, random)
    return createVideoNode({ ...base, src: videoAsset!.url, poster: poster.url, fit: 'cover' })
  }
  const generated = {
    ...base,
    generationId: `scale-generation-${index}`,
    status: 'succeeded' as const,
    prompt: `中立规模测试素材 ${index + 1}`,
    params: {
      fixtureSeed: seed,
      fixtureIndex: index,
      fixtureAssetId: primaryAsset.id,
      sourceWidth: primaryAsset.width,
      sourceHeight: primaryAsset.height,
      ...(videoAsset ? { durationSeconds: videoAsset.durationSeconds } : {}),
    },
    src: primaryAsset.url,
    fit: 'cover' as const,
    sourceFwIds,
  }
  if (type === 'ai-image') return createAiImageNode(generated)
  const poster = pickAsset(PUBLIC_IMAGE_ASSETS, random)
  return createAiVideoNode({ ...generated, poster: poster.url })
}

/**
 * 创建可直接交给两套渲染器的确定性大规模画布。
 * 复杂度为 O(nodeCount + 实际输出边数)，不做节点间的全表查找。
 */
export function createScaleFixture(options: ScaleFixtureOptions): FrameNode {
  assertNonNegativeInteger(options.nodeCount, 'nodeCount')
  const random = createSeededRandom(options.seed)
  const topology = createTopology(options)
  const counts = allocateTypeCounts(options.nodeCount, options.typeRatios)
  const types = assignTypes(options.nodeCount, counts, topology.forcedGenerated, random)
  const columns = options.nodeCount === 0 ? 0 : Math.ceil(Math.sqrt(options.nodeCount))
  const rows = columns === 0 ? 0 : Math.ceil(options.nodeCount / columns)
  const children = new Array<CanvasNode>(options.nodeCount)

  for (let index = 0; index < options.nodeCount; index += 1) {
    const column = index % columns
    const row = Math.floor(index / columns)
    children[index] = createMaterialNode(
      types[index]!,
      index,
      CANVAS_PADDING + column * (NODE_CELL_WIDTH + COLUMN_GAP),
      CANVAS_PADDING + row * (NODE_CELL_HEIGHT + ROW_GAP),
      options.seed,
      topology.sourcesByIndex[index] ?? [],
      random,
    )
  }

  if (options.connectionPattern === 'distributed') {
    for (let index = 1; index < children.length; index += 1) {
      const node = children[index]!
      if (node.fwType === 'ai-image' || node.fwType === 'ai-video') {
        node.sourceFwIds = [nodeId(index - 1)]
      }
    }
  }

  const contentWidth =
    columns === 0 ? 0 : columns * NODE_CELL_WIDTH + (columns - 1) * COLUMN_GAP
  const contentHeight =
    rows === 0 ? 0 : rows * NODE_CELL_HEIGHT + (rows - 1) * ROW_GAP
  return createFrameNode({
    fwId: 'scale-fixture-root',
    name: `规模夹具（${options.nodeCount} 节点）`,
    width: contentWidth + CANVAS_PADDING * 2,
    height: contentHeight + CANVAS_PADDING * 2,
    background: '#FFFFFF',
    children,
  })
}
