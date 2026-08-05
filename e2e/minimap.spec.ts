import { expect, test, type Page } from '@playwright/test'
import {
  createAudioNode,
  createBoxNode,
  createFrameNode,
  createImgNode,
  createVideoNode,
  type FrameNode,
} from '../packages/core/src/index'
import { openCustomDocument } from './custom-document'

const CULLING_STORAGE_KEY = 'framewright:viewport-culling-limits'

interface PixelBox {
  x: number
  y: number
  width: number
  height: number
}

async function readColorComponents(page: Page, hex: string): Promise<PixelBox[]> {
  return page.getByTestId('minimap-content-canvas').evaluate((canvas, targetHex) => {
    const context = canvas.getContext('2d')
    if (context === null) throw new Error('小地图没有 2D context')
    const target = targetHex.slice(1).match(/../g)!.map((part) => Number.parseInt(part, 16))
    const { width, height } = canvas
    const pixels = context.getImageData(0, 0, width, height).data
    const matched = new Uint8Array(width * height)
    for (let index = 0; index < width * height; index += 1) {
      const offset = index * 4
      if (
        pixels[offset] === target[0] && pixels[offset + 1] === target[1] &&
        pixels[offset + 2] === target[2] && pixels[offset + 3] === 255
      ) matched[index] = 1
    }

    const result: PixelBox[] = []
    const queue: number[] = []
    for (let start = 0; start < matched.length; start += 1) {
      if (matched[start] === 0) continue
      matched[start] = 0
      queue.push(start)
      let minX = width
      let minY = height
      let maxX = -1
      let maxY = -1
      while (queue.length > 0) {
        const current = queue.pop()!
        const x = current % width
        const y = Math.floor(current / width)
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
        for (const neighbor of [current - 1, current + 1, current - width, current + width]) {
          if (neighbor < 0 || neighbor >= matched.length || matched[neighbor] === 0) continue
          const neighborX = neighbor % width
          if (Math.abs(neighborX - x) > 1) continue
          matched[neighbor] = 0
          queue.push(neighbor)
        }
      }
      result.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    }
    return result.filter((box) => box.width * box.height >= 4)
  }, hex)
}

async function readWhiteIconMask(page: Page, box: PixelBox): Promise<string> {
  return page.getByTestId('minimap-content-canvas').evaluate((canvas, target) => {
    const context = canvas.getContext('2d')!
    const pixels = context.getImageData(target.x, target.y, target.width, target.height).data
    let mask = ''
    for (let index = 0; index < pixels.length; index += 4) {
      mask += pixels[index]! > 235 && pixels[index + 1]! > 235 && pixels[index + 2]! > 235 ? '1' : '0'
    }
    return mask
  }, box)
}

function createVisualFixture(): FrameNode {
  return createFrameNode({
    fwId: 'root', name: '小地图视觉夹具', width: 800, height: 450, background: '#ffffff',
    children: [
      createBoxNode({ fwId: 'wide', x: 20, y: 20, width: 200, height: 100 }),
      createBoxNode({ fwId: 'tall', x: 300, y: 20, width: 100, height: 200 }),
      createImgNode({ fwId: 'image', x: 20, y: 270, width: 160, height: 100, src: '/missing-image.png' }),
      createVideoNode({ fwId: 'video', x: 220, y: 270, width: 160, height: 100 }),
      createAudioNode({ fwId: 'audio', x: 420, y: 270, width: 160, height: 100 }),
      createImgNode({ fwId: 'tiny-image', x: 620, y: 260, width: 40, height: 40, src: '/missing-tiny.png' }),
      createVideoNode({ fwId: 'tiny-video', x: 680, y: 260, width: 40, height: 40 }),
      createAudioNode({ fwId: 'tiny-audio', x: 740, y: 260, width: 40, height: 40 }),
    ],
  })
}

test('小地图按真实宽高比绘制，并用颜色与矢量图标区分图片、视频、音频', async ({ page }) => {
  await openCustomDocument(page, createVisualFixture(), '小地图视觉夹具', 'fixture')
  await expect(page.getByTestId('minimap-content-canvas')).toBeVisible()

  const boxComponents = await readColorComponents(page, '#64748b')
  expect(boxComponents).toHaveLength(2)
  const [wide, tall] = boxComponents.sort((left, right) => left.x - right.x)
  expect(wide!.width / wide!.height).toBeCloseTo(2, 1)
  expect(tall!.width / tall!.height).toBeCloseTo(0.5, 1)

  const typeColors = ['#2563eb', '#7c3aed', '#db2777'] as const
  const largeBoxes: PixelBox[] = []
  for (const color of typeColors) {
    const components = (await readColorComponents(page, color)).sort(
      (left, right) => right.width * right.height - left.width * left.height,
    )
    expect(components.length).toBeGreaterThanOrEqual(2)
    largeBoxes.push(components[0]!)
    // 投影后不足 12×12px 的节点只有类型颜色，不应出现白色图标像素。
    expect(await readWhiteIconMask(page, components.at(-1)!)).not.toContain('1')
  }

  const iconMasks = await Promise.all(largeBoxes.map((box) => readWhiteIconMask(page, box)))
  for (const mask of iconMasks) expect(mask).toContain('1')
  expect(new Set(iconMasks).size).toBe(3)
})

async function createRedDataUrl(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 8
    canvas.height = 8
    const context = canvas.getContext('2d')!
    context.fillStyle = '#ff0000'
    context.fillRect(0, 0, 8, 8)
    return canvas.toDataURL('image/png')
  })
}

function createThumbnailFixture(count: number, src: string): FrameNode {
  return createFrameNode({
    fwId: 'root', name: '小地图缩略阈值夹具', width: 800, height: 450, background: '#ffffff',
    children: Array.from({ length: count }, (_, index) =>
      createImgNode({
        fwId: `thumbnail-${index}`,
        x: 100,
        y: 80,
        width: 500,
        height: 280,
        src,
        fit: 'fill',
      }),
    ),
  })
}

async function replaceDocumentRoot(page: Page, root: FrameNode): Promise<void> {
  const documentId = new URL(page.url()).pathname.split('/').at(-1)!
  const response = await page.request.put(`/api/documents/${encodeURIComponent(documentId)}`, {
    data: { name: '小地图缩略阈值夹具', root, historySeq: 0 },
  })
  expect(response.ok()).toBe(true)
  await page.reload()
}

async function readPixel(page: Page, x: number, y: number): Promise<readonly number[]> {
  return page.getByTestId('minimap-content-canvas').evaluate((canvas, point) => {
    const context = canvas.getContext('2d')!
    return [...context.getImageData(point.x, point.y, 1, 1).data]
  }, { x, y })
}

test('图片缩略在 2500 上限内出现，第 2501 项降级为类型颜色', async ({ page }) => {
  await page.goto('/')
  const redDataUrl = await createRedDataUrl(page)
  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({ maxNodes: 1, maxConnections: 0 }))
  }, CULLING_STORAGE_KEY)
  await openCustomDocument(page, createThumbnailFixture(2500, redDataUrl))

  // 节点投影范围是 x=31..146、y=41..105；取左上内侧，避开居中的矢量图标。
  await expect.poll(() => readPixel(page, 36, 46)).toEqual([255, 0, 0, 255])

  await replaceDocumentRoot(page, createThumbnailFixture(2501, redDataUrl))
  await expect.poll(() => readPixel(page, 36, 46)).toEqual([37, 99, 235, 255])
})
