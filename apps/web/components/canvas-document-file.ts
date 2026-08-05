import {
  isAiImageNode,
  isAiVideoNode,
  isBoxNode,
  isFrameNode,
  isImgNode,
  isVideoNode,
  type CanvasNode,
  type CanvasOp,
  type FrameNode,
} from '@framewright/core'

export type CanvasRootParseResult =
  | { ok: true; root: FrameNode }
  | { ok: false; error: string }

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function hasBaseNodeFields(value: Record<string, unknown>): boolean {
  return (
    typeof value['fwId'] === 'string' &&
    value['fwId'].length > 0 &&
    typeof value['name'] === 'string' &&
    isFiniteNumber(value['x']) &&
    isFiniteNumber(value['y']) &&
    isFiniteNumber(value['width']) &&
    value['width'] >= 0 &&
    isFiniteNumber(value['height']) &&
    value['height'] >= 0 &&
    isFiniteNumber(value['rotation']) &&
    isFiniteNumber(value['opacity']) &&
    value['opacity'] >= 0 &&
    value['opacity'] <= 1 &&
    typeof value['visible'] === 'boolean' &&
    typeof value['locked'] === 'boolean'
  )
}

function isObjectFit(value: unknown): boolean {
  return value === 'contain' || value === 'cover' || value === 'fill'
}

function hasGenerationFields(value: Record<string, unknown>): boolean {
  return (
    (value['generationId'] === null || typeof value['generationId'] === 'string') &&
    ['empty', 'pending', 'running', 'succeeded', 'failed'].includes(String(value['status'])) &&
    (value['errorMessage'] === null || typeof value['errorMessage'] === 'string') &&
    typeof value['prompt'] === 'string' &&
    isRecord(value['params']) &&
    (value['src'] === null || typeof value['src'] === 'string') &&
    Array.isArray(value['sourceFwIds']) &&
    value['sourceFwIds'].every((item) => typeof item === 'string')
  )
}

/**
 * PUT 与本地文件导入共用的唯一节点树校验入口。
 *
 * 用显式栈保持 O(n) 且避免深树递归爆栈；节点类型分派复用 core 的守卫，
 * web 层只负责验证 JSON 值是否满足对应类型的字段约束。
 */
export function isCanvasNode(value: unknown): value is CanvasNode {
  const pending: unknown[] = [value]
  const fwIds = new Set<string>()

  while (pending.length > 0) {
    const current = pending.pop()
    if (!isRecord(current) || !hasBaseNodeFields(current)) return false

    const node = current as unknown as CanvasNode
    if (fwIds.has(node.fwId)) return false
    fwIds.add(node.fwId)

    if (isFrameNode(node)) {
      if (
        typeof current['clip'] !== 'boolean' ||
        (current['background'] !== null && typeof current['background'] !== 'string') ||
        !Array.isArray(current['children'])
      ) {
        return false
      }
      for (let index = current['children'].length - 1; index >= 0; index -= 1) {
        pending.push(current['children'][index])
      }
      continue
    }
    if (isBoxNode(node)) {
      if (typeof current['fill'] !== 'string' || !isFiniteNumber(current['cornerRadius'])) return false
      continue
    }
    if (isImgNode(node)) {
      if (typeof current['src'] !== 'string' || !isObjectFit(current['fit'])) return false
      continue
    }
    if (isVideoNode(node)) {
      if (
        typeof current['src'] !== 'string' ||
        (current['poster'] !== null && typeof current['poster'] !== 'string') ||
        !isObjectFit(current['fit'])
      ) {
        return false
      }
      continue
    }
    if (isAiImageNode(node)) {
      if (!hasGenerationFields(current) || !isObjectFit(current['fit'])) return false
      continue
    }
    if (isAiVideoNode(node)) {
      if (
        !hasGenerationFields(current) ||
        (current['poster'] !== null && typeof current['poster'] !== 'string') ||
        !isObjectFit(current['fit'])
      ) {
        return false
      }
      continue
    }
    return false
  }

  return true
}

export function parseCanvasRootJson(json: string): CanvasRootParseResult {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return { ok: false, error: '导入失败：文件不是有效的 JSON。' }
  }

  if (!isCanvasNode(value) || !isFrameNode(value)) {
    return { ok: false, error: '导入失败：文件不是合法的画布节点树。' }
  }
  return { ok: true, root: value }
}

export function serializeCanvasRoot(root: FrameNode): string {
  return `${JSON.stringify(root, null, 2)}\n`
}

/** root 的 fwId 是当前文档容器身份，导入时保留它才能让同一个 op 正确撤销与重做。 */
export function createImportRootOp(current: FrameNode, imported: FrameNode): CanvasOp {
  const next: FrameNode = { ...imported, fwId: current.fwId }
  return {
    kind: 'update-node',
    fwId: current.fwId,
    before: current,
    after: next,
  }
}

function safeFileName(documentName: string | undefined): string {
  const name = documentName?.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
  return name ? `${name}.json` : 'canvas.json'
}

export function downloadCanvasRoot(root: FrameNode, documentName?: string): void {
  const href = URL.createObjectURL(new Blob([serializeCanvasRoot(root)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = safeFileName(documentName)
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(href), 0)
}
