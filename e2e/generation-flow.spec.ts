import { expect, test, type Page } from '@playwright/test'
import {
  MockGenerationProvider,
  type GenerationTask,
} from '../packages/provider/src/index'
import { selectRenderer } from './renderer'
import { createDocument } from './create-document'

type ProviderOptions = ConstructorParameters<typeof MockGenerationProvider>[0]

interface GenerationTransport {
  readonly statuses: GenerationTask['status'][]
  readonly skeletonStatuses: GenerationTask['status'][]
}

function dataUrlToBuffer(url: string): { body: Buffer; contentType: string } {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(url)
  if (match === null) throw new Error('mock provider 没有返回 base64 data URL')
  return { contentType: match[1]!, body: Buffer.from(match[2]!, 'base64') }
}

/**
 * 当前产品尚未提供 /api/generations Route Handler。这里在 HTTP 边界接入仓内真实
 * MockGenerationProvider，覆盖 host 的浏览器接线与 provider 产物；缺失的服务端全链路
 * 单独在本轮 report 中列为 blocker，避免把 transport stub 冒充数据库集成测试。
 */
async function installGenerationTransport(
  page: Page,
  node: ReturnType<Page['locator']>,
  options: ProviderOptions,
): Promise<GenerationTransport> {
  const provider = new MockGenerationProvider(options)
  const statuses: GenerationTask['status'][] = []
  const skeletonStatuses: GenerationTask['status'][] = []
  let taskId = ''
  let generationId = ''
  let generatedAsset: { body: Buffer; contentType: string } | null = null

  await page.route('**/api/assets/e2e-generated-video', async (route) => {
    if (generatedAsset === null) {
      await route.fulfill({ status: 404, body: 'asset not ready' })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: generatedAsset.contentType,
      body: generatedAsset.body,
    })
  })

  await page.route('**/api/generations/*/poll', async (route) => {
    const snapshot = await provider.poll(taskId)
    statuses.push(snapshot.status)

    if (snapshot.status === 'pending' || snapshot.status === 'running') {
      await expect(node.locator('[data-fw-generation-skeleton="true"]')).toBeVisible()
      skeletonStatuses.push(snapshot.status)
    }

    const outputAssetIds = snapshot.status === 'succeeded' ? ['e2e-generated-video'] : []
    if (snapshot.status === 'succeeded') {
      const url = snapshot.result?.[0]?.url
      if (url === undefined) throw new Error('成功的视频任务没有产物 URL')
      generatedAsset = dataUrlToBuffer(url)
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: generationId,
        status: snapshot.status,
        outputAssetIds,
        errorMessage: snapshot.error,
      }),
    })
  })

  await page.route('**/api/generations', async (route) => {
    const request = route.request().postDataJSON() as {
      params: GenerationTask['params']
    }
    taskId = await provider.submit(request.params)
    generationId = `e2e-generation-${taskId}`
    statuses.push('pending')
    await expect(node.locator('[data-fw-generation-skeleton="true"]')).toBeVisible()
    skeletonStatuses.push('pending')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generation: {
          id: generationId,
          status: 'pending',
          outputAssetIds: [],
          errorMessage: null,
        },
        taskId,
      }),
    })
  })

  return { statuses, skeletonStatuses }
}

async function openDocument(page: Page): Promise<void> {
  await page.goto('/')
  await createDocument(page)
  await expect(page.getByTestId('canvas-host')).toHaveAttribute('data-history-ready', 'true')
  await selectRenderer(page, 'HTML / DOM')
  await expect(page.getByTestId('active-renderer')).toHaveText('HTML / DOM')
}

function mainNodeCta(page: Page, fwId: string) {
  return page.locator(
    `[data-fw-id="${fwId}"] button:not([data-fw-node-toolbar] button)`,
  )
}

test('生成视频从 pending、running 进入成功态，产物能被浏览器真实播放', async ({ page }) => {
  await openDocument(page)
  const node = page.locator('[data-fw-id="ai-video-2"]')
  const transport = await installGenerationTransport(page, node, {
    failureRate: 0,
    pendingPolls: 1,
    runningPolls: 1,
  })

  await mainNodeCta(page, 'ai-video-2').click()
  await expect(node.locator('[data-fw-generation-skeleton="true"]')).toBeVisible()

  const video = node.locator('video')
  await expect(video).toBeVisible()
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState))
    .toBeGreaterThanOrEqual(2)

  await video.evaluate(async (element: HTMLVideoElement) => {
    element.muted = true
    await element.play()
  })
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime > 0 || element.ended))
    .toBe(true)

  expect(transport.statuses).toEqual(['pending', 'pending', 'running', 'succeeded'])
  expect(transport.skeletonStatuses).toEqual(['pending', 'pending', 'running'])
  await expect(node.locator('[data-fw-generation-skeleton="true"]')).toHaveCount(0)
  await expect(node.locator('[data-fw-generation-badge="true"]')).toBeVisible()
})

test('failureRate=1 时进入失败态，显示错误文案与卡片内重试入口', async ({ page }) => {
  await openDocument(page)
  const node = page.locator('[data-fw-id="ai-video-2"]')
  const transport = await installGenerationTransport(page, node, {
    failureRate: 1,
    pendingPolls: 0,
    runningPolls: 1,
  })

  await mainNodeCta(page, 'ai-video-2').click()
  await expect(node.locator('[data-fw-generation-skeleton="true"]')).toBeVisible()

  const error = node.locator('[data-fw-generation-error="true"]')
  await expect(error).toBeVisible()
  await expect(error).toContainText('mock')
  await expect(mainNodeCta(page, 'ai-video-2')).toHaveText('重试')
  expect(transport.statuses).toEqual(['pending', 'running', 'failed'])
  expect(transport.skeletonStatuses).toEqual(['pending', 'running'])
})
