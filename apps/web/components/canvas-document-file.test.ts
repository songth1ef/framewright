import {
  applyOp,
  createBoxNode,
  createFrameNode,
  createImgNode,
  createVideoNode,
  invertOp,
} from '@framewright/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createImportRootOp,
  downloadCanvasRoot,
  parseCanvasRootJson,
  serializeCanvasRoot,
} from './canvas-document-file'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('画布 JSON 导入/导出', () => {
  it('导出只序列化 document root，并能被导入解析', () => {
    const root = createFrameNode({
      fwId: 'root',
      children: [
        createImgNode({ fwId: 'image', src: '/image.png' }),
        createVideoNode({ fwId: 'video', src: '/video.mp4' }),
      ],
    })

    const json = serializeCanvasRoot(root)
    const result = parseCanvasRootJson(json)

    expect(JSON.parse(json)).toEqual(root)
    expect(result).toEqual({ ok: true, root })
  })

  it.each([
    ['损坏的 JSON', '{'],
    ['根节点不是 frame', JSON.stringify(createBoxNode({ fwId: 'box' }))],
    ['节点缺字段', JSON.stringify({ ...createBoxNode({ fwId: 'box' }), fill: undefined })],
    ['未知节点类型', JSON.stringify({ ...createBoxNode({ fwId: 'box' }), fwType: 'text' })],
  ])('%s 时返回可展示的错误', (_label, json) => {
    expect(parseCanvasRootJson(json)).toEqual({
      ok: false,
      error: expect.any(String),
    })
  })

  it('拒绝 fwId 重复的节点树', () => {
    const root = createFrameNode({
      fwId: 'root',
      children: [createBoxNode({ fwId: 'same' }), createBoxNode({ fwId: 'same' })],
    })

    expect(parseCanvasRootJson(JSON.stringify(root))).toEqual({
      ok: false,
      error: expect.any(String),
    })
  })

  it('线性校验 10,000 个节点的画布', () => {
    const root = createFrameNode({
      fwId: 'root',
      children: Array.from({ length: 10_000 }, (_, index) =>
        createBoxNode({ fwId: `box-${index}` }),
      ),
    })

    const result = parseCanvasRootJson(JSON.stringify(root))

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.root.children).toHaveLength(10_000)
  })

  it('导入通过一个既有 update-node op 替换 root，且可撤销和重做', () => {
    const current = createFrameNode({
      fwId: 'current-root',
      name: '当前画布',
      children: [createBoxNode({ fwId: 'before' })],
    })
    const imported = createFrameNode({
      fwId: 'foreign-root',
      name: '导入画布',
      children: [createBoxNode({ fwId: 'after' })],
    })

    const op = createImportRootOp(current, imported)
    const next = applyOp(current, op)

    expect(op.kind).toBe('update-node')
    expect(next).toEqual({ ...imported, fwId: current.fwId })
    expect(applyOp(next, invertOp(op))).toEqual(current)
    expect(applyOp(current, op)).toEqual(next)
  })

  it('导出触发 JSON 文件下载，并在点击后释放 Blob URL', () => {
    vi.useFakeTimers()
    const click = vi.fn()
    const remove = vi.fn()
    const append = vi.fn()
    const anchor = { href: '', download: '', click, remove }
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
      body: { append },
    })
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:canvas')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const root = createFrameNode({ fwId: 'root' })

    downloadCanvasRoot(root, '分镜/一')

    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(anchor).toMatchObject({ href: 'blob:canvas', download: '分镜-一.json' })
    expect(append).toHaveBeenCalledWith(anchor)
    expect(click).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:canvas')
  })
})
