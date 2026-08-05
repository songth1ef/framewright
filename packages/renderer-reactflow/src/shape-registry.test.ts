import { describe, expect, it } from 'vitest'
import { REACT_FLOW_SHAPES } from './shape-registry'

describe('React Flow 探针 shape registry', () => {
  it('只把基准必需类型注册为 supported，其余显式 unsupported', () => {
    expect(REACT_FLOW_SHAPES).toMatchObject({
      frame: { support: 'supported' },
      box: { support: 'supported' },
      img: { support: 'supported' },
      video: { support: 'supported' },
      audio: { support: 'unsupported' },
      'ai-image': { support: 'supported' },
      'ai-video': { support: 'supported' },
    })
  })
})
