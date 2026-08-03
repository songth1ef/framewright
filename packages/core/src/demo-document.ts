import {
  createBoxNode,
  createFrameNode,
  createImgNode,
  createVideoNode,
  type FrameNode,
} from './node-schema'

/**
 * P0 的固定 demo 文档。两个渲染器与全部对照测试共用同一份输入——
 * 输入不同，对照就没有意义。
 *
 * 刻意覆盖：嵌套 frame（验证坐标累加）、同层多 box（验证 z 序 = 数组顺序）、
 * img 与 video（验证注册表里的 unsupported 占位实现真的被走到）。
 */
export function createDemoDocument(): FrameNode {
  const boxBack = createBoxNode({
    fwId: 'box-back',
    name: '底层方块',
    x: 40,
    y: 40,
    width: 200,
    height: 140,
    fill: '#4C8BF5',
  })

  const boxFront = createBoxNode({
    fwId: 'box-front',
    name: '上层方块',
    x: 120,
    y: 100,
    width: 200,
    height: 140,
    fill: '#F55A4C',
    cornerRadius: 16,
  })

  const nestedBox = createBoxNode({
    fwId: 'nested-box',
    name: '嵌套方块',
    x: 20,
    y: 20,
    width: 120,
    height: 80,
    fill: '#3DBE7B',
  })

  const innerFrame = createFrameNode({
    fwId: 'inner-frame',
    name: '内层画框',
    x: 380,
    y: 60,
    width: 240,
    height: 180,
    clip: true,
    background: '#F2F2F2',
    children: [nestedBox],
  })

  const img = createImgNode({
    fwId: 'img-1',
    name: '图片占位',
    x: 40,
    y: 300,
    width: 160,
    height: 100,
  })

  const video = createVideoNode({
    fwId: 'video-1',
    name: '视频占位',
    x: 240,
    y: 300,
    width: 160,
    height: 100,
  })

  return createFrameNode({
    fwId: 'root',
    name: '画布',
    x: 0,
    y: 0,
    width: 800,
    height: 450,
    background: '#FFFFFF',
    children: [boxBack, boxFront, innerFrame, img, video],
  })
}
