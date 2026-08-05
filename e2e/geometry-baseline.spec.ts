import { expect, test } from '@playwright/test'
import { selectRenderer } from './renderer'
import { resetDocuments } from './reset-documents'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}
type Bounds = Record<string, Rect>

const CASES = [
  { label: 'HTML / DOM', snapshot: 'bounds-dom.json' },
  { label: 'LeaferJS', snapshot: 'bounds-leafer.json' },
] as const

test('几何基线路径与运行平台无关', async ({}, testInfo) => {
  const snapshotPath = testInfo.snapshotPath('bounds-dom.json').replaceAll('\\', '/')
  expect(snapshotPath).toMatch(/\/geometry-baseline\.spec\.ts-snapshots\/bounds-dom\.json$/)
})

for (const testCase of CASES) {
  test(`几何基线：${testCase.label}`, async ({ page }) => {
    await resetDocuments(page)
    await page.goto('/')
    await selectRenderer(page, testCase.label)
    await expect(page.getByTestId('active-renderer')).toHaveText(testCase.label)

    const bounds = (await page.evaluate(
      () => (window as unknown as { __fwGetBounds: () => Bounds }).__fwGetBounds(),
    )) as Bounds

    // key 排序后再序列化，否则遍历顺序变化会造成假 diff
    const stable = Object.fromEntries(
      Object.keys(bounds)
        .sort()
        .map((fwId) => [fwId, bounds[fwId]]),
    )
    expect(JSON.stringify(stable, null, 2)).toMatchSnapshot(testCase.snapshot)
  })
}
