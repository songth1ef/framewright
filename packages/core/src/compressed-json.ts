/**
 * 大 JSON 请求体的 gzip 传输。
 *
 * 🔴 为什么需要：Vercel serverless 的请求体上限是 **4.5 MB（十进制，4,500,000 字节）**，
 * 不是 4.5 MiB。UI 生成的 10000 节点画布是 4,554,794 字节 —— 超了 54,794 字节，
 * 约 1.2%，于是整个「大数据量测试」在线上必然 413，而本地毫无问题（本地没有这个上限）。
 *
 * 实测阈值（对生产环境二分）：
 *   4.19 MiB (4.39 MB) → 201
 *   4.29 MiB (4.50 MB) → 413
 *
 * 实测这份 JSON 的 gzip 压缩比是 **17.7x**（4.34 MiB → 0.24 MiB），
 * 压缩后 10000 节点只占上限的 5%，十万节点也塞得下。
 *
 * 为什么不选别的方案：
 * - 分片上传要引入分片协议与失败重组，复杂度高一个量级；
 * - 缩短字段名只能省 20~30%，负载再涨一点就又卡住 —— 治标。
 * gzip 一次性给出 17 倍余量，且对调用方几乎透明。
 *
 * ⚠️ 服务端必须显式解压：Node 的 fetch/undici 只自动解压**响应**体，不解压请求体。
 */

/** 超过这个大小才压缩。小负载压缩的收益抵不过两侧的 CPU 与代码路径成本。 */
export const COMPRESS_THRESHOLD_BYTES = 512 * 1024

/** 与 Vercel serverless 的实测上限一致（十进制 MB，不是 MiB）。 */
export const REQUEST_BODY_LIMIT_BYTES = 4_500_000

export const CONTENT_ENCODING_GZIP = 'gzip'

/**
 * 把值序列化成请求体；超过阈值时用 gzip 压缩。
 *
 * 返回 body 与应附加的 header。**由调用方决定是否压缩**而不是内部偷偷决定，
 * 是为了让「这一次到底压没压」在调用点可见 —— 传输层的隐式行为最难排查。
 */
export async function encodeJsonBody(
  value: unknown,
): Promise<{ body: BodyInit; headers: Record<string, string>; rawBytes: number; sentBytes: number }> {
  const json = JSON.stringify(value)
  const raw = new TextEncoder().encode(json)
  const headers: Record<string, string> = { 'content-type': 'application/json' }

  if (raw.byteLength < COMPRESS_THRESHOLD_BYTES || typeof CompressionStream === 'undefined') {
    return { body: json, headers, rawBytes: raw.byteLength, sentBytes: raw.byteLength }
  }

  const compressed = await gzipBytes(raw)
  return {
    body: compressed as unknown as BodyInit,
    headers: { ...headers, 'content-encoding': CONTENT_ENCODING_GZIP },
    rawBytes: raw.byteLength,
    sentBytes: compressed.byteLength,
  }
}

async function gzipBytes(input: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([input as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))
  const buffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(buffer)
}

/**
 * 读请求体并按需解压。**必须由服务端显式调用** —— 见文件头注释。
 *
 * 解压失败不静默吞掉：一个声称 gzip 却解不开的请求是客户端 bug 或攻击，
 * 应当明确失败，而不是当成空对象继续。
 */
export async function decodeJsonBody(request: Request): Promise<unknown> {
  const encoding = request.headers.get('content-encoding')?.toLowerCase().trim()
  if (encoding !== CONTENT_ENCODING_GZIP) return request.json()

  const compressed = new Uint8Array(await request.arrayBuffer())
  const stream = new Blob([compressed as BlobPart]).stream()
    .pipeThrough(new DecompressionStream('gzip'))
  const text = await new Response(stream).text()
  return JSON.parse(text)
}

/** 给用户看的超限提示。只说「HTTP 413」指不到根因，要写清超了多少。 */
export function describeOversizedPayload(sentBytes: number): string {
  const overBytes = sentBytes - REQUEST_BODY_LIMIT_BYTES
  const mb = (value: number) => (value / 1_000_000).toFixed(2)
  return `请求体 ${mb(sentBytes)} MB 超出服务端上限 ${mb(REQUEST_BODY_LIMIT_BYTES)} MB（超 ${mb(overBytes)} MB）`
}
