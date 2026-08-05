/** schema 单一真相源。任何 node 字段的增删改只在本文件发生。 */

export const SHAPE_TYPES = ['frame', 'box', 'img', 'video', 'audio', 'ai-image', 'ai-video'] as const
export type ShapeType = (typeof SHAPE_TYPES)[number]

export type ObjectFit = 'contain' | 'cover' | 'fill'

/** 生成单元的生命周期状态，见 docs/domain.md §3.2.1。 */
export type GenerationStatus = 'empty' | 'pending' | 'running' | 'succeeded' | 'failed'

/** 所有 node 共有的字段。fw 前缀者为 framewright 语义字段，其余为几何/呈现字段。 */
export interface BaseNode {
  fwId: string
  fwType: ShapeType
  name: string
  /** 相对父节点左上角的偏移，不是画布绝对坐标 */
  x: number
  y: number
  width: number
  height: number
  /** 度 */
  rotation: number
  /** 0–1 */
  opacity: number
  visible: boolean
  locked: boolean
}

export interface FrameNode extends BaseNode {
  fwType: 'frame'
  clip: boolean
  background: string | null
  /** 数组顺序即 z 序，靠后者画在上面。不设 zIndex 字段。 */
  children: CanvasNode[]
}

export interface BoxNode extends BaseNode {
  fwType: 'box'
  fill: string
  cornerRadius: number
}

export interface ImgNode extends BaseNode {
  fwType: 'img'
  src: string
  fit: ObjectFit
}

export interface VideoNode extends BaseNode {
  fwType: 'video'
  src: string
  poster: string | null
  fit: ObjectFit
}

export interface AudioNode extends BaseNode {
  fwType: 'audio'
  src: string
}

/**
 * 生成单元（一等公民，docs/domain.md §3.2.1）。复合业务组件：
 * 一个 node 渲染成一整套视觉，但整体只是一个 node。
 */
export interface AiImageNode extends BaseNode {
  fwType: 'ai-image'
  generationId: string | null
  status: GenerationStatus
  errorMessage: string | null
  /** 生成参数原样留存，供查看与一键复跑 */
  prompt: string
  /** 模型、尺寸、时长、种子等，形状由 provider 决定 */
  params: Record<string, unknown>
  src: string | null
  fit: ObjectFit
  /** 来源节点的 fwId 列表（派生自），空数组 = 无来源。仅生成单元拥有（§3.2.2）。 */
  sourceFwIds: string[]
}

export interface AiVideoNode extends BaseNode {
  fwType: 'ai-video'
  generationId: string | null
  status: GenerationStatus
  errorMessage: string | null
  prompt: string
  params: Record<string, unknown>
  src: string | null
  poster: string | null
  fit: ObjectFit
  /** 来源节点的 fwId 列表（派生自），空数组 = 无来源。仅生成单元拥有（§3.2.2）。 */
  sourceFwIds: string[]
}

export type CanvasNode =
  | FrameNode
  | BoxNode
  | ImgNode
  | VideoNode
  | AudioNode
  | AiImageNode
  | AiVideoNode

export function isFrameNode(node: CanvasNode): node is FrameNode {
  return node.fwType === 'frame'
}
export function isBoxNode(node: CanvasNode): node is BoxNode {
  return node.fwType === 'box'
}
export function isImgNode(node: CanvasNode): node is ImgNode {
  return node.fwType === 'img'
}
export function isVideoNode(node: CanvasNode): node is VideoNode {
  return node.fwType === 'video'
}
export function isAudioNode(node: CanvasNode): node is AudioNode {
  return node.fwType === 'audio'
}
export function isAiImageNode(node: CanvasNode): node is AiImageNode {
  return node.fwType === 'ai-image'
}
export function isAiVideoNode(node: CanvasNode): node is AiVideoNode {
  return node.fwType === 'ai-video'
}

function baseDefaults(fwId: string, fwType: ShapeType): BaseNode {
  return {
    fwId,
    fwType,
    name: '',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
  }
}

type Init<T extends CanvasNode> = Partial<Omit<T, 'fwType'>> & { fwId: string }

export function createFrameNode(init: Init<FrameNode>): FrameNode {
  return {
    ...baseDefaults(init.fwId, 'frame'),
    fwType: 'frame',
    clip: false,
    background: null,
    children: [],
    ...init,
  }
}

export function createBoxNode(init: Init<BoxNode>): BoxNode {
  return {
    ...baseDefaults(init.fwId, 'box'),
    fwType: 'box',
    fill: '#CCCCCC',
    cornerRadius: 0,
    ...init,
  }
}

export function createImgNode(init: Init<ImgNode>): ImgNode {
  return {
    ...baseDefaults(init.fwId, 'img'),
    fwType: 'img',
    src: '',
    fit: 'contain',
    ...init,
  }
}

export function createVideoNode(init: Init<VideoNode>): VideoNode {
  return {
    ...baseDefaults(init.fwId, 'video'),
    fwType: 'video',
    src: '',
    poster: null,
    fit: 'contain',
    ...init,
  }
}

export function createAudioNode(init: Init<AudioNode>): AudioNode {
  return {
    ...baseDefaults(init.fwId, 'audio'),
    fwType: 'audio',
    src: '',
    ...init,
  }
}

function aiGeneratedDefaults() {
  return {
    generationId: null,
    status: 'empty' as GenerationStatus,
    errorMessage: null,
    prompt: '',
    params: {},
    src: null,
    fit: 'contain' as ObjectFit,
    sourceFwIds: [],
  }
}

export function createAiImageNode(init: Init<AiImageNode>): AiImageNode {
  return {
    ...baseDefaults(init.fwId, 'ai-image'),
    fwType: 'ai-image',
    ...aiGeneratedDefaults(),
    ...init,
  }
}

export function createAiVideoNode(init: Init<AiVideoNode>): AiVideoNode {
  return {
    ...baseDefaults(init.fwId, 'ai-video'),
    fwType: 'ai-video',
    ...aiGeneratedDefaults(),
    poster: null,
    ...init,
  }
}
