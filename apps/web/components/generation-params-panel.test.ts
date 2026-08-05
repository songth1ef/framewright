import { DEFAULT_VIEWPORT, createAiImageNode, createAiVideoNode } from '@framewright/core'
import { describe, expect, it } from 'vitest'
import {
  DURATION_OPTIONS,
  MODEL_OPTIONS,
  PANEL_GAP,
  PANEL_HEIGHT,
  PANEL_WIDTH,
  SIZE_OPTIONS,
  computePanelPlacement,
  formValuesFromNode,
} from './generation-params-panel'

describe('formValuesFromNode', () => {
  it('用节点留存的 prompt / params 预填表单', () => {
    const node = createAiImageNode({
      fwId: 'a1',
      prompt: '一只猫',
      params: { model: 'mock-hd', size: '576x1024' },
    })
    expect(formValuesFromNode(node)).toEqual({
      prompt: '一只猫',
      model: 'mock-hd',
      size: '576x1024',
    })
  })

  it('params 缺失时回落到中立默认值；图片节点不带 duration', () => {
    const node = createAiImageNode({ fwId: 'a1' })
    const values = formValuesFromNode(node)
    expect(values).toEqual({
      prompt: '',
      model: MODEL_OPTIONS[0],
      size: '1024x1024',
    })
    expect('duration' in values).toBe(false)
  })

  it('视频节点带 duration：优先用 params 留存的数值，缺省给默认', () => {
    const withParam = createAiVideoNode({ fwId: 'v1', params: { duration: 8 } })
    expect(formValuesFromNode(withParam).duration).toBe('8')
    const withoutParam = createAiVideoNode({ fwId: 'v2' })
    const values = formValuesFromNode(withoutParam)
    expect(values.duration).toBe(DURATION_OPTIONS[0])
    expect(values.size).toBe('1024x576')
  })

  it('params 里类型不对的字段当作缺失处理', () => {
    const node = createAiImageNode({
      fwId: 'a1',
      params: { model: 42, size: null },
    })
    const values = formValuesFromNode(node)
    expect(values.model).toBe(MODEL_OPTIONS[0])
    expect(values.size).toBe(SIZE_OPTIONS[0])
  })
})

describe('computePanelPlacement', () => {
  const base = {
    nodeX: 100,
    nodeY: 100,
    nodeWidth: 160,
    nodeHeight: 100,
    containerWidth: 800,
    containerHeight: 450,
  }

  it('默认挂在节点正下方，左对齐节点左缘，间隔固定屏幕像素', () => {
    expect(computePanelPlacement({ ...base, viewport: DEFAULT_VIEWPORT })).toEqual({
      left: 100,
      top: 100 + 100 + PANEL_GAP,
    })
  })

  it('锚点跟随视口缩放平移，但间距与面板尺寸是固定屏幕像素（B.4：UI 附件不缩放）', () => {
    const viewport = { scale: 0.5, offsetX: 40, offsetY: 20 }
    const placement = computePanelPlacement({ ...base, viewport })
    // 屏幕坐标 = 世界坐标 × scale + offset；间距不乘 scale
    expect(placement.left).toBe(100 * 0.5 + 40)
    expect(placement.top).toBe((100 + 100) * 0.5 + 20 + PANEL_GAP)
    expect(PANEL_WIDTH).toBeGreaterThan(0)
    expect(PANEL_HEIGHT).toBeGreaterThan(0)
  })

  it('节点贴近容器右缘时向左收进容器内', () => {
    const placement = computePanelPlacement({
      ...base,
      nodeX: 700,
      viewport: DEFAULT_VIEWPORT,
    })
    expect(placement.left).toBe(800 - PANEL_WIDTH)
  })

  it('下方放不下时翻到节点上方', () => {
    const placement = computePanelPlacement({
      ...base,
      nodeY: 400,
      viewport: DEFAULT_VIEWPORT,
    })
    expect(placement.top).toBe(400 - PANEL_GAP - PANEL_HEIGHT)
  })

  it('上下都放不下时钳进容器，不出负坐标', () => {
    const placement = computePanelPlacement({
      ...base,
      nodeY: 200,
      containerHeight: 200,
      viewport: DEFAULT_VIEWPORT,
    })
    expect(placement.top).toBeGreaterThanOrEqual(0)
    expect(placement.top + PANEL_HEIGHT).toBeLessThanOrEqual(200)
  })
})
