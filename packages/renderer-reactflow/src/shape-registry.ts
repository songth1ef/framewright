import {
  SHAPE_TYPES,
  assertShapeCoverage,
  type RendererId,
  type ShapeType,
} from '@framewright/core'

export type ShapeSupport = 'supported' | 'unsupported'

export interface ProbeShapeRegistration {
  support: ShapeSupport
  reason?: string
}

const unsupported = (reason: string): ProbeShapeRegistration => ({
  support: 'unsupported',
  reason,
})

/**
 * 这不是第三套生产 renderer。只声明三项测量所需的形状能力；未测能力必须显式留痕。
 */
export const REACT_FLOW_SHAPES: Record<ShapeType, ProbeShapeRegistration> = {
  frame: { support: 'supported' },
  box: { support: 'supported' },
  img: { support: 'supported' },
  video: { support: 'supported' },
  audio: unsupported('探针不测音频节点'),
  'ai-image': { support: 'supported' },
  'ai-video': { support: 'supported' },
}

// RendererId 当前封闭为 dom | leafer；局部强转是探针对契约不开放的显式记录。
assertShapeCoverage('reactflow' as RendererId, REACT_FLOW_SHAPES)

export { SHAPE_TYPES }
