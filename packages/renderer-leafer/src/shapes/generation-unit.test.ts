// @vitest-environment jsdom
import '../leafer-test-stub'
import { describe, expect, it } from 'vitest'
import {
  GEN_UNIT_STYLE,
  NODE_ACTIONS,
  createAiImageNode,
  createAiVideoNode,
  type AiImageNode,
  type AiVideoNode,
} from '@framewright/core'
import { Rect, Text, type IUI } from 'leafer-ui'
import { createGenerationUnitShape } from './generation-unit'

const S = GEN_UNIT_STYLE
const factory = createGenerationUnitShape()

type GenNode = AiImageNode | AiVideoNode

function build(node: GenNode): IUI {
  return factory({ node, position: { x: 0, y: 0 }, selected: false })
}

function collectAll(root: IUI): IUI[] {
  const out: IUI[] = [root]
  for (const child of root.children ?? []) out.push(...collectAll(child as IUI))
  return out
}

function rectsOf(root: IUI): Rect[] {
  return collectAll(root).filter((e) => e.tag === 'Rect') as unknown as Rect[]
}

function textValues(root: IUI): string[] {
  return collectAll(root)
    .filter((e) => e.tag === 'Text')
    .map((e) => String((e as unknown as Text).text))
}

function findText(root: IUI, text: string): Text {
  const found = collectAll(root).find(
    (e) => e.tag === 'Text' && (e as unknown as Text).text === text,
  )
  if (found === undefined) throw new Error(`找不到文本元素: ${text}`)
  return found as unknown as Text
}

describe('C1-leafer 生成单元四态', () => {
  it('empty：虚线外框 + 满尺寸底色 + 居中「点击生成」，无 footer', () => {
    const node = createAiImageNode({ fwId: 'g1', width: 160, height: 100, status: 'empty' })
    const ui = build(node)
    expect(ui.dashPattern).toEqual([4, 4])
    expect(ui.stroke).toBe(S.borderColor)
    const content = rectsOf(ui).find((r) => r.fill === S.emptyBackground)
    expect(content?.width).toBe(160)
    expect(content?.height).toBe(100)
    expect(textValues(ui)).toContain('点击生成')
    expect(rectsOf(ui).some((r) => r.fill === S.footerBackground)).toBe(false)
  })

  it('pending：🔴 骨架屏占满节点完整尺寸 + 底部进度条，无 footer', () => {
    const node = createAiVideoNode({ fwId: 'g2', width: 160, height: 100, status: 'pending' })
    const ui = build(node)
    const skeleton = rectsOf(ui).find((r) => r.fill === S.skeletonBase)
    expect(skeleton?.width).toBe(160)
    expect(skeleton?.height).toBe(100)
    // 扫光高亮带
    expect(rectsOf(ui).some((r) => r.fill === S.skeletonHighlight)).toBe(true)
    // 进度条：轨道贴内容区底边，条在轨道上
    const track = rectsOf(ui).find((r) => r.fill === S.progressTrackColor)
    expect(track?.height).toBe(S.progressHeight)
    expect(track?.y).toBe(100 - S.progressHeight)
    expect(rectsOf(ui).some((r) => r.fill === S.progressBarColor)).toBe(true)
    expect(textValues(ui)).not.toContain('点击生成')
    expect(rectsOf(ui).some((r) => r.fill === S.footerBackground)).toBe(false)
  })

  it('running：拿不到进度百分比时视觉与 pending 相同', () => {
    const node = createAiImageNode({ fwId: 'g3', width: 200, height: 120, status: 'running' })
    const ui = build(node)
    const skeleton = rectsOf(ui).find((r) => r.fill === S.skeletonBase)
    expect(skeleton?.width).toBe(200)
    expect(skeleton?.height).toBe(120)
    expect(rectsOf(ui).some((r) => r.fill === S.progressBarColor)).toBe(true)
  })

  it('succeeded：内容区让出 footer + prompt 省略号 + AI生成徽标 + 实线边框', () => {
    const node = createAiImageNode({
      fwId: 'g4',
      width: 160,
      height: 100,
      status: 'succeeded',
      prompt: 'a cat sitting on a windowsill',
      src: 'https://example.com/cat.png',
      fit: 'cover',
    })
    const ui = build(node)
    expect(ui.dashPattern).toBeUndefined()
    expect(ui.stroke).toBe(S.borderColor)
    // 内容区图片：高度 = node.height - footerHeight，fit=cover → leafer 的 cover 模式
    const image = rectsOf(ui).find(
      (r) => typeof r.fill === 'object' && (r.fill as { type?: string }).type === 'image',
    )
    expect(image?.height).toBe(100 - S.footerHeight)
    expect((image?.fill as { url?: string; mode?: string }).url).toBe('https://example.com/cat.png')
    expect((image?.fill as { mode?: string }).mode).toBe('cover')
    // footer
    const footer = rectsOf(ui).find((r) => r.fill === S.footerBackground)
    expect(footer?.y).toBe(100 - S.footerHeight)
    expect(footer?.height).toBe(S.footerHeight)
    const promptText = findText(ui, 'a cat sitting on a windowsill')
    expect(promptText.textOverflow).toBe('ellipsis')
    expect(promptText.fontSize).toBe(S.footerFontSize)
    // 徽标
    expect(textValues(ui)).toContain('AI生成')
  })

  it('succeeded 的 ai-video 用 poster 做内容区画面', () => {
    const node = createAiVideoNode({
      fwId: 'g5',
      width: 160,
      height: 100,
      status: 'succeeded',
      src: 'https://example.com/v.mp4',
      poster: 'https://example.com/poster.png',
      fit: 'contain',
    })
    const ui = build(node)
    const image = rectsOf(ui).find(
      (r) => typeof r.fill === 'object' && (r.fill as { type?: string }).type === 'image',
    )
    expect((image?.fill as { url?: string }).url).toBe('https://example.com/poster.png')
    expect((image?.fill as { mode?: string }).mode).toBe('fit') // contain → leafer 的 fit
  })

  it('failed：失败底色与边框 + errorMessage + 「重试」，无 footer', () => {
    const node = createAiVideoNode({
      fwId: 'g6',
      width: 160,
      height: 100,
      status: 'failed',
      errorMessage: '生成超时',
    })
    const ui = build(node)
    expect(ui.stroke).toBe(S.failedBorderColor)
    const content = rectsOf(ui).find((r) => r.fill === S.failedBackground)
    expect(content?.width).toBe(160)
    expect(content?.height).toBe(100)
    expect(textValues(ui)).toContain('生成超时')
    expect(textValues(ui)).toContain('重试')
    expect(rectsOf(ui).some((r) => r.fill === S.footerBackground)).toBe(false)
  })

  it('failed：errorMessage 为空时显示「生成失败」', () => {
    const node = createAiImageNode({ fwId: 'g7', status: 'failed', errorMessage: null })
    const ui = build(node)
    expect(textValues(ui)).toContain('生成失败')
  })

  it('🔴 不泄漏：整棵内部树没有任何 framewright 字段', () => {
    const node = createAiImageNode({
      fwId: 'g8',
      status: 'succeeded',
      prompt: 'p',
      src: 'https://example.com/x.png',
    })
    const ui = build(node)
    // 注意：leafer 元素原生就有 locked / children 属性，它们的存在不证明泄漏；
    // node 侧 locked 不进渲染器属性这一点由 node-props.test.ts 在映射对象层面断言。
    for (const e of collectAll(ui)) {
      const raw = e as unknown as Record<string, unknown>
      expect(raw['fwId']).toBeUndefined()
      expect(raw['fwType']).toBeUndefined()
      expect(raw['sourceFwIds']).toBeUndefined()
      expect(raw['prompt']).toBeUndefined()
      expect(raw['params']).toBeUndefined()
    }
  })

  it('选中态：外框用选中描边（与 frame/box 同一语义）', () => {
    const node = createAiImageNode({ fwId: 'g9', status: 'empty' })
    const ui = factory({ node, position: { x: 0, y: 0 }, selected: true })
    expect(ui.stroke).toBe('#5B8091')
    expect(ui.strokeWidth).toBe(2)
  })
})

describe('C1-leafer 内部按钮标记', () => {
  // 按 2026-08-04 裁定：本轮只打「内部交互、不参与选中/拖拽/双击」的语义标记，
  // 点击行为（onNodeAction）延到 D0-min，不许自造临时回调通道。
  it('「点击生成」带 fwInternalAction=generate 标记', () => {
    const node = createAiImageNode({ fwId: 'g10', status: 'empty' })
    const ui = build(node)
    const button = findText(ui, '点击生成') as unknown as IUI
    expect((button.data as Record<string, unknown>)['fwInternalAction']).toBe(
      NODE_ACTIONS.generate,
    )
  })

  it('「重试」带 fwInternalAction=retry 标记', () => {
    const node = createAiImageNode({ fwId: 'g11', status: 'failed', errorMessage: 'x' })
    const ui = build(node)
    const button = findText(ui, '重试') as unknown as IUI
    expect((button.data as Record<string, unknown>)['fwInternalAction']).toBe(NODE_ACTIONS.retry)
  })

  it('按钮以外的内部元素不带动作标记', () => {
    const node = createAiImageNode({ fwId: 'g12', status: 'failed', errorMessage: 'x' })
    const ui = build(node)
    const message = findText(ui, 'x') as unknown as IUI
    expect((message.data as Record<string, unknown> | undefined)?.['fwInternalAction']).toBeUndefined()
  })
})
