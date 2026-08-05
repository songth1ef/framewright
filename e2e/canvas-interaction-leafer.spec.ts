import { expect, test } from '@playwright/test'
import { selectRenderer } from './renderer'
import { resetDocuments } from './reset-documents'

// D2-leafer 验收：点选与框选在真实浏览器里走 Leafer 命中探针（selector.getByPoint），
// 单测的桩环境覆盖不了真实 hit canvas。行为口径与 DOM 侧一致（host-interaction.spec.ts）。

test.beforeEach(async ({ page }) => {
  await resetDocuments(page)
  await page.goto('/')
  await selectRenderer(page, 'LeaferJS')
  await expect(page.getByTestId('active-renderer')).toHaveText('LeaferJS')
})

test('Leafer 侧点选业务单元，host 选中集一致', async ({ page }) => {
  const canvas = await page.getByTestId('canvas-container').boundingBox()
  expect(canvas).not.toBeNull()

  // box-back 位于画布 (40,40,200,140)
  await page.mouse.click(canvas!.x + 50, canvas!.y + 50)
  await expect(page.getByTestId('selection')).toHaveText('box-back')

  // box-front 压在 box-back 之上，点重叠区命中最上层
  await page.mouse.click(canvas!.x + 130, canvas!.y + 110)
  await expect(page.getByTestId('selection')).toHaveText('box-front')
})

test('Leafer 侧框选按相交收集，点击空白清空选中', async ({ page }) => {
  const canvas = await page.getByTestId('canvas-container').boundingBox()
  expect(canvas).not.toBeNull()

  await page.mouse.move(canvas!.x + 25, canvas!.y + 25)
  await page.mouse.down()
  await page.mouse.move(canvas!.x + 110, canvas!.y + 90, { steps: 5 })
  await page.mouse.up()
  await expect(page.getByTestId('selection')).toHaveText('box-back')

  await page.mouse.click(canvas!.x + 780, canvas!.y + 20)
  await expect(page.getByTestId('selection-count')).toHaveText('0')
})

test('Leafer 侧 Shift 点击切换选中', async ({ page }) => {
  const canvas = await page.getByTestId('canvas-container').boundingBox()
  expect(canvas).not.toBeNull()

  await page.mouse.click(canvas!.x + 50, canvas!.y + 50)
  await expect(page.getByTestId('selection')).toHaveText('box-back')

  // Shift 点重叠区增选 box-front
  await page.keyboard.down('Shift')
  await page.mouse.click(canvas!.x + 130, canvas!.y + 110)
  await page.keyboard.up('Shift')
  await expect(page.getByTestId('selection-count')).toHaveText('2')

  // Shift 再点 box-back 非重叠区减选
  await page.keyboard.down('Shift')
  await page.mouse.click(canvas!.x + 50, canvas!.y + 50)
  await page.keyboard.up('Shift')
  await expect(page.getByTestId('selection')).toHaveText('box-front')
})

type Bounds = Record<string, { x: number; y: number; width: number; height: number }>

async function readBounds(page: import('@playwright/test').Page): Promise<Bounds> {
  return page.evaluate(
    () => (window as unknown as { __fwGetBounds: () => Bounds }).__fwGetBounds(),
  )
}

test('Leafer 侧拖拽移动：松手才提交，位置写回且切换渲染器后不弹回', async ({ page }) => {
  const canvas = await page.getByTestId('canvas-container').boundingBox()
  expect(canvas).not.toBeNull()

  // box-back 初始 (40,40,200,140)；「松手才提交、不逐帧」由单测断言 onNodesMove 调用次数覆盖
  await page.mouse.move(canvas!.x + 60, canvas!.y + 60)
  await page.mouse.down()
  await page.mouse.move(canvas!.x + 90, canvas!.y + 85, { steps: 5 })
  await page.mouse.up()

  await expect.poll(async () => (await readBounds(page))['box-back']).toMatchObject({ x: 70, y: 65 })
  await selectRenderer(page, 'HTML / DOM')
  await selectRenderer(page, 'LeaferJS')
  await expect.poll(async () => (await readBounds(page))['box-back']).toMatchObject({ x: 70, y: 65 })
})

test('Leafer 侧单选等比缩放：拖 se 角松手提交一次', async ({ page }) => {
  const canvas = await page.getByTestId('canvas-container').boundingBox()
  expect(canvas).not.toBeNull()

  // 先点选 box-back，再拖其 se 控制点（角点 (240,180)）
  await page.mouse.click(canvas!.x + 50, canvas!.y + 50)
  await expect(page.getByTestId('selection')).toHaveText('box-back')

  await page.mouse.move(canvas!.x + 240, canvas!.y + 180)
  await page.mouse.down()
  await page.mouse.move(canvas!.x + 340, canvas!.y + 250, { steps: 5 })
  await page.mouse.up()

  // 等比：宽向 300/200 与高向 210/140 同为 1.5 倍
  await expect
    .poll(async () => (await readBounds(page))['box-back'])
    .toMatchObject({ x: 40, y: 40, width: 300, height: 210 })
})

test('Leafer 侧键盘：方向键微调、Ctrl+A 全选、Esc 清空、Delete 删除', async ({ page }) => {
  const canvas = await page.getByTestId('canvas-container').boundingBox()
  expect(canvas).not.toBeNull()

  // 方向键 1px、Shift+方向键 10px
  await page.mouse.click(canvas!.x + 50, canvas!.y + 50)
  await expect(page.getByTestId('selection')).toHaveText('box-back')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowDown')
  await expect.poll(async () => (await readBounds(page))['box-back']).toMatchObject({ x: 41, y: 50 })

  // Ctrl+A 全选（demo 文档共 9 个可选节点），Esc 清空
  await page.keyboard.press('Control+a')
  await expect(page.getByTestId('selection-count')).toHaveText('9')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('selection-count')).toHaveText('0')

  // Delete 删除选中集
  await page.mouse.click(canvas!.x + 460, canvas!.y + 320)
  await expect(page.getByTestId('selection')).toHaveText('ai-image-1')
  await page.keyboard.press('Delete')
  await expect.poll(async () => (await readBounds(page))['ai-image-1']).toBeUndefined()
})
