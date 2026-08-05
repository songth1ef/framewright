import { expect, test } from '@playwright/test'
import {
  collectVisibleNodeIds,
  createDemoDocument,
  type FrameNode,
} from '../packages/core/src/index'
import { selectRenderer } from './renderer'
import { resetDocuments } from './reset-documents'

const CASES = [
  { label: 'HTML / DOM' },
  { label: 'LeaferJS' },
] as const

function expectedVisible(innerFrameVisible: boolean): readonly string[] {
  const root = createDemoDocument()
  const innerFrame = root.children.find((node) => node.fwId === 'inner-frame') as FrameNode
  innerFrame.visible = innerFrameVisible
  return [...collectVisibleNodeIds(root)].sort()
}

async function readVisible(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() =>
    (window as unknown as { __fwGetVisible: () => string[] }).__fwGetVisible(),
  )
}

async function openRenderer(
  page: import('@playwright/test').Page,
  testCase: (typeof CASES)[number],
): Promise<void> {
  await resetDocuments(page)
  await page.goto('/')
  await selectRenderer(page, testCase.label)
  await expect(page.getByTestId('active-renderer')).toHaveText(testCase.label)
}

for (const testCase of CASES) {
  test(`${testCase.label} 初始可见节点与 core 一致`, async ({ page }) => {
    await openRenderer(page, testCase)
    await expect.poll(async () => (await readVisible(page)).sort()).toEqual(expectedVisible(true))
  })

  test(`${testCase.label} 隐藏 frame 后级联隐藏后代`, async ({ page }) => {
    await openRenderer(page, testCase)
    await page.getByTestId('toggle-inner-frame').click()
    await expect.poll(async () => (await readVisible(page)).sort()).toEqual(expectedVisible(false))
  })
}
