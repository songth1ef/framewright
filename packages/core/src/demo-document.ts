import { DEMO_IMAGE_DATA_URL, DEMO_VIDEO_DATA_URL } from './demo-media'
import {
  createAiImageNode,
  createAiVideoNode,
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

  // 这两个纯素材节点原先没有 src，画面上就是两个空框 —— demo 当初只当几何夹具用，
  // 媒体从来不是它的一部分。但它同时也是用户打开 localhost:3100 看到的东西，
  // 空着会让人以为「图片/视频组件没做」。媒体内联在 demo-media.ts，
  // 不入二进制文件、也不依赖外网。
  const img = createImgNode({
    fwId: 'img-1',
    name: '图片素材',
    x: 40,
    y: 300,
    width: 160,
    height: 100,
    src: DEMO_IMAGE_DATA_URL,
  })

  const video = createVideoNode({
    fwId: 'video-1',
    name: '视频素材',
    x: 240,
    y: 300,
    width: 160,
    height: 100,
    src: DEMO_VIDEO_DATA_URL,
  })

  // 溯源关系示例：一个 ai-image 派生出两个 ai-video（§3.2.2），
  // 是波次 2 连线渲染与测试的输入
  const aiImage = createAiImageNode({
    fwId: 'ai-image-1',
    name: '生成图片',
    x: 440,
    y: 300,
    width: 160,
    height: 100,
    status: 'succeeded',
    prompt: 'a cat sitting on a windowsill',
    // 成功态却没有产物，画出来就是个空框 —— 「成功」这一态原先在 demo 里看不出成功
    src: DEMO_IMAGE_DATA_URL,
  })

  const aiVideo1 = createAiVideoNode({
    fwId: 'ai-video-1',
    name: '派生视频 A',
    x: 620,
    y: 300,
    width: 160,
    height: 100,
    status: 'running',
    prompt: 'a cat sitting on a windowsill, gentle motion',
    sourceFwIds: ['ai-image-1'],
  })

  const aiVideo2 = createAiVideoNode({
    fwId: 'ai-video-2',
    name: '派生视频 B',
    x: 630,
    y: 60,
    width: 160,
    height: 100,
    status: 'failed',
    prompt: 'a cat sitting on a windowsill, camera pan',
    errorMessage: '生成超时',
    sourceFwIds: ['ai-image-1'],
  })

  return createFrameNode({
    fwId: 'root',
    name: '画布',
    x: 0,
    y: 0,
    width: 800,
    height: 450,
    background: '#FFFFFF',
    children: [boxBack, boxFront, innerFrame, img, video, aiImage, aiVideo1, aiVideo2],
  })
}
