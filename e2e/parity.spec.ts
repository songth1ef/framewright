import { expect, test } from '@playwright/test'

type Bounds = Record<string, { x: number; y: number; width: number; height: number }>

async function readBounds(page: import('@playwright/test').Page): Promise<Bounds> {
  return page.evaluate(
    () => (window as unknown as { __fwGetBounds: () => Bounds }).__fwGetBounds(),
  ) as Promise<Bounds>
}

test('两个渲染器对同一份 node 树报告完全相同的几何', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('active-renderer')).toHaveText('HTML / DOM')
  const domBounds = await readBounds(page)

  await page.getByTestId('renderer-switch').click()
  await expect(page.getByTestId('active-renderer')).toHaveText('LeaferJS')
  const leaferBounds = await readBounds(page)

  expect(Object.keys(leaferBounds).sort()).toEqual(Object.keys(domBounds).sort())
  for (const fwId of Object.keys(domBounds)) {
    expect(leaferBounds[fwId], `节点 ${fwId} 的几何在两个渲染器间不一致`).toEqual(
      domBounds[fwId],
    )
  }
})
