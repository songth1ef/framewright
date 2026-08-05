// @vitest-environment jsdom
// 🔴 任何 import leafer-ui 的测试文件必须把桩放在第一个 import（见桩内注释）
import './leafer-test-stub'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Box, Leafer, Rect } from 'leafer-ui'
import { createLeaferHitProbe, type CanvasHitProbe } from './hit-probe'

// 命中探针针对真实 Leafer 场景图的验证（jsdom 桩环境，不做真实渲染）。
// 场景结构与 index.ts buildNode 的标记方式一致：
// 节点容器带 data.fwId；内部按钮带 data.fwInternalAction；overlay 控制点带 fwResizeHandle+fwId。
// ⚠️ 桩环境 measureText 返回 0 宽，Text 元素命中不可靠，故用 Rect 模拟按钮——
//    探针只认 data 标记，与元素 tag 无关；真实 Text 按钮的命中由 e2e（真实浏览器）覆盖。

let container: HTMLDivElement
let leafer: Leafer | null
let probe: CanvasHitProbe

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  leafer = new Leafer({ view: container })

  const rootBox = new Box({ x: 0, y: 0, width: 300, height: 200, fill: '#FFFFFF' })
  rootBox.data = { fwId: 'root' }
  const boxA = new Rect({ x: 10, y: 10, width: 20, height: 20, fill: '#FF0000' })
  boxA.data = { fwId: 'box-a' }
  rootBox.add(boxA)
  const genUnit = new Box({ x: 90, y: 90, width: 100, height: 60, fill: '#EEEEEE' })
  genUnit.data = { fwId: 'gen-1' }
  const button = new Rect({ x: 10, y: 10, width: 60, height: 20, fill: '#CCCCCC' })
  button.data = { fwInternalAction: 'retry' }
  genUnit.add(button)
  // 视频控制条（C3）：fwVideoControl 标记，与内部动作按钮同待遇但不上报 onNodeAction
  const videoNode = new Box({ x: 90, y: 160, width: 120, height: 40, fill: '#000000' })
  videoNode.data = { fwId: 'video-1' }
  const controlBar = new Rect({ x: 0, y: 20, width: 120, height: 20, fill: '#333333' })
  controlBar.data = { fwVideoControl: true }
  videoNode.add(controlBar)
  rootBox.add(videoNode)
  rootBox.add(genUnit)
  // 选中 overlay 的控制点：挂在 root 之后（最上层），带 fwResizeHandle + 所属节点 fwId
  const handle = new Rect({ x: 26, y: 26, width: 8, height: 8, fill: '#FFFFFF' })
  handle.data = { fwResizeHandle: 'se', fwId: 'box-a' }
  leafer.add(rootBox)
  leafer.add(handle)

  probe = createLeaferHitProbe(leafer)
})

afterEach(() => {
  leafer?.destroy()
  leafer = null
  container.remove()
})

describe('D2-leafer 命中探针', () => {
  it('命中最上层业务单元并解析 fwId', () => {
    expect(probe({ x: 15, y: 15 })).toEqual({
      fwId: 'box-a',
      resizeHandle: null,
      internalAction: false,
    })
  })

  it('命中 root 内部空白与完全空白（root 之外）', () => {
    expect(probe({ x: 250, y: 150 }).fwId).toBe('root')
    expect(probe({ x: 400, y: 300 })).toEqual({
      fwId: null,
      resizeHandle: null,
      internalAction: false,
    })
  })

  it('命中内部动作按钮：internalAction 为 true 且仍能拿到所属节点 fwId', () => {
    expect(probe({ x: 110, y: 105 })).toEqual({
      fwId: 'gen-1',
      resizeHandle: null,
      internalAction: true,
    })
  })

  it('命中缩放控制点：解析出角与所属节点 fwId', () => {
    expect(probe({ x: 30, y: 30 })).toEqual({
      fwId: 'box-a',
      resizeHandle: { fwId: 'box-a', corner: 'se' },
      internalAction: false,
    })
  })

  it('命中视频控制条：internalAction 为 true（排除画布手势）且能拿到所属节点 fwId', () => {
    expect(probe({ x: 100, y: 190 })).toEqual({
      fwId: 'video-1',
      resizeHandle: null,
      internalAction: true,
    })
  })

  it('host 视口 transform（leafer.scale/x/y）参与命中换算', () => {
    leafer!.scale = 2
    leafer!.x = 100
    leafer!.y = 50
    expect(probe({ x: 100 + 15 * 2, y: 50 + 15 * 2 }).fwId).toBe('box-a')
  })
})
