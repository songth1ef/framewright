import { describe, expect, it } from 'vitest'
import {
  COMPRESS_THRESHOLD_BYTES,
  REQUEST_BODY_LIMIT_BYTES,
  decodeJsonBody,
  describeOversizedPayload,
  encodeJsonBody,
} from './compressed-json'
import { createScaleFixture } from './scale-fixture'

/** 把 encodeJsonBody 的产物还原成一个真实 Request，走与服务端完全相同的解码路径。 */
function toRequest(encoded: Awaited<ReturnType<typeof encodeJsonBody>>): Request {
  return new Request('http://localhost/api/documents', {
    method: 'POST',
    headers: encoded.headers,
    body: encoded.body,
  })
}

describe('大 JSON 请求体压缩', () => {
  it('小负载不压缩：压缩的 CPU 与代码路径成本抵不过收益', async () => {
    const encoded = await encodeJsonBody({ name: '小画布', root: { fwId: 'root' } })
    expect(encoded.headers['content-encoding']).toBeUndefined()
    expect(encoded.sentBytes).toBe(encoded.rawBytes)
    expect(encoded.rawBytes).toBeLessThan(COMPRESS_THRESHOLD_BYTES)
  })

  it('大负载压缩后往返内容完全一致', async () => {
    const root = createScaleFixture({ nodeCount: 2000, connectionPattern: 'many-to-many', seed: 'roundtrip' })
    const payload = { name: '规模测试', root }
    const encoded = await encodeJsonBody(payload)

    expect(encoded.headers['content-encoding']).toBe('gzip')
    expect(encoded.sentBytes).toBeLessThan(encoded.rawBytes)

    const decoded = await decodeJsonBody(toRequest(encoded))
    expect(decoded).toEqual(JSON.parse(JSON.stringify(payload)))
  })

  // 这条是本次修复的**验收条件**：UI 的 10000 节点负载实测 4,554,794 字节，
  // 超出 Vercel 上限 4,500,000 字节，线上必然 413。压缩后必须落回限内。
  it('UI 规模的 10000 节点负载压缩后落在服务端上限内', async () => {
    const root = createScaleFixture({
      nodeCount: 10000,
      connectionPattern: 'many-to-many',
      seed: 'scale-fixture-ui',
    })
    const encoded = await encodeJsonBody({ name: '规模测试（10000 节点 · many-to-many）', root })

    expect(encoded.rawBytes).toBeGreaterThan(REQUEST_BODY_LIMIT_BYTES)
    expect(encoded.sentBytes).toBeLessThan(REQUEST_BODY_LIMIT_BYTES)
    // 实测压缩比约 17.7x；留足余量断言，避免因素材清单微调而变成抖动测试。
    expect(encoded.rawBytes / encoded.sentBytes).toBeGreaterThan(5)
  })

  it('未压缩请求走原路径，不受影响', async () => {
    const request = new Request('http://localhost/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '普通画布' }),
    })
    await expect(decodeJsonBody(request)).resolves.toEqual({ name: '普通画布' })
  })

  it('声称 gzip 却解不开时明确失败，不当成空对象', async () => {
    const request = new Request('http://localhost/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
      body: new Uint8Array([1, 2, 3, 4]),
    })
    await expect(decodeJsonBody(request)).rejects.toThrow()
  })

  it('超限提示写清超了多少，而不是只说 413', () => {
    expect(describeOversizedPayload(4_554_794)).toContain('4.55')
    expect(describeOversizedPayload(4_554_794)).toContain('4.50')
  })
})
