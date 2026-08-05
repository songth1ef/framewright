import type { Page } from '@playwright/test'

export const RENDERER_LABELS = ['HTML / DOM', 'LeaferJS'] as const

export type RendererLabel = (typeof RENDERER_LABELS)[number]

export async function selectRenderer(page: Page, target: RendererLabel): Promise<void> {
  const activeRenderer = page.getByTestId('active-renderer')
  const rendererSwitch = page.getByTestId('renderer-switch')

  for (let switchCount = 0; switchCount <= RENDERER_LABELS.length; switchCount += 1) {
    const current = (await activeRenderer.textContent())?.trim()
    if (current === target) return
    if (switchCount < RENDERER_LABELS.length) await rendererSwitch.click()
  }

  const current = (await activeRenderer.textContent())?.trim() ?? '<无法读取>'
  throw new Error(
    `切换 ${RENDERER_LABELS.length} 次后仍未找到渲染器“${target}”；当前标签：“${current}”`,
  )
}
