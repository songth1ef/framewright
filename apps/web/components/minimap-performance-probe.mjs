import { chromium } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const nodeCounts = [100, 1_000, 10_000]
const thumbnailLimits = [100, 500, 1_000, 2_500, 5_000, 10_000]
const repetitions = 5
// 必须为奇数：动态脉冲按奇偶帧换色，首尾指纹才能证明画面真的变化。
const frameCount = 89
const longFrameMs = 50

function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
await page.setContent('<canvas id="minimap" width="200" height="150"></canvas>')

async function sample(nodeCount, mode, thumbnailLimit = 0) {
  return page.evaluate(async ({ frameCount, longFrameMs, mode, nodeCount, thumbnailLimit }) => {
    const canvas = document.querySelector('#minimap')
    const context = canvas.getContext('2d', { alpha: true })
    const source = new OffscreenCanvas(32, 20)
    const sourceContext = source.getContext('2d')
    const gradient = sourceContext.createLinearGradient(0, 0, 32, 20)
    gradient.addColorStop(0, '#0ea5e9')
    gradient.addColorStop(1, '#f97316')
    sourceContext.fillStyle = gradient
    sourceContext.fillRect(0, 0, 32, 20)
    const bitmap = source.transferToImageBitmap()
    const columns = Math.ceil(Math.sqrt(nodeCount))
    const items = Array.from({ length: nodeCount }, (_, index) => ({
      x: (index % columns) * 5 % 196,
      y: Math.floor(index / columns) * 4 % 146,
      width: 8,
      height: 6,
      image: index % 10 < 7,
      type: index % 3,
    }))
    const density = new Uint32Array(100 * 75)
    for (let index = 0; index < nodeCount; index += 1) density[index % density.length] += 1
    const densityImage = context.createImageData(100, 75)
    for (let index = 0; index < density.length; index += 1) {
      if (density[index] === 0) continue
      const offset = index * 4
      densityImage.data[offset] = 80
      densityImage.data[offset + 1] = 180
      densityImage.data[offset + 2] = 220
      densityImage.data[offset + 3] = 220
    }
    const calls = { fillRect: 0, drawImage: 0, putImageData: 0 }
    const longTasks = []
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration)
    })
    try {
      observer.observe({ type: 'longtask', buffered: false })
    } catch {
      // Chromium 支持 longtask；保留兼容兜底，帧间隔仍会记录。
    }

    const fingerprint = () => {
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data
      let hash = 2166136261
      for (let index = 0; index < data.length; index += 97) {
        hash ^= data[index]
        hash = Math.imul(hash, 16777619)
      }
      return hash >>> 0
    }
    const draw = (frame) => {
      if (mode === 'legacy') {
        densityImage.data[(frame % density.length) * 4 + 3] = frame % 2 === 0 ? 150 : 250
        context.putImageData(densityImage, 0, 0)
        calls.putImageData += 1
        return
      }
      context.clearRect(0, 0, 200, 150)
      let thumbnailCount = 0
      for (const item of items) {
        context.fillStyle = mode === 'shape'
          ? '#5b8def'
          : item.type === 0 ? '#2563eb' : item.type === 1 ? '#7c3aed' : '#db2777'
        context.fillRect(item.x, item.y, item.width, item.height)
        calls.fillRect += 1
        if (mode === 'thumbnail' && item.image && thumbnailCount < thumbnailLimit) {
          context.drawImage(bitmap, item.x, item.y, item.width, item.height)
          calls.drawImage += 1
          thumbnailCount += 1
        }
      }
      context.fillStyle = frame % 2 === 0 ? '#ffffff' : '#000000'
      context.fillRect(0, 0, 2, 2)
      calls.fillRect += 1
    }

    draw(0)
    const firstFingerprint = fingerprint()
    const intervals = []
    let previous = performance.now()
    const startedAt = previous
    for (let frame = 1; frame <= frameCount; frame += 1) {
      await new Promise(requestAnimationFrame)
      const now = performance.now()
      intervals.push(now - previous)
      previous = now
      draw(frame)
    }
    await new Promise(requestAnimationFrame)
    const durationMs = performance.now() - startedAt
    const lastFingerprint = fingerprint()
    observer.disconnect()
    bitmap.close()
    return {
      fps: frameCount * 1_000 / durationMs,
      maxFrameMs: Math.max(...intervals),
      longFrames: intervals.filter((duration) => duration > longFrameMs).length,
      longTasks: longTasks.length,
      fingerprints: [firstFingerprint, lastFingerprint],
      fingerprintChanged: firstFingerprint !== lastFingerprint,
      calls,
    }
  }, { frameCount, longFrameMs, mode, nodeCount, thumbnailLimit })
}

const scenarios = []
for (const nodeCount of nodeCounts) {
  for (const variant of [
    { mode: 'legacy', thumbnailLimit: 0 },
    { mode: 'shape', thumbnailLimit: 0 },
    { mode: 'type', thumbnailLimit: 0 },
    ...thumbnailLimits.map((thumbnailLimit) => ({ mode: 'thumbnail', thumbnailLimit })),
  ]) {
    const samples = []
    for (let repetition = 0; repetition < repetitions; repetition += 1) {
      samples.push(await sample(nodeCount, variant.mode, variant.thumbnailLimit))
    }
    const result = {
      nodeCount,
      ...variant,
      medianFps: median(samples.map((item) => item.fps)),
      medianMaxFrameMs: median(samples.map((item) => item.maxFrameMs)),
      medianLongFrames: median(samples.map((item) => item.longFrames)),
      medianLongTasks: median(samples.map((item) => item.longTasks)),
      fingerprintChanged: samples.every((item) => item.fingerprintChanged),
      fingerprints: samples.map((item) => item.fingerprints),
      actualDrawCalls: samples.map((item) => item.calls),
    }
    scenarios.push(result)
    console.log(JSON.stringify(result))
  }
}

const acceptedLimits = thumbnailLimits.filter((thumbnailLimit) => nodeCounts.every((nodeCount) => {
  const baseline = scenarios.find((item) => item.nodeCount === nodeCount && item.mode === 'type')
  const candidate = scenarios.find((item) => item.nodeCount === nodeCount && item.mode === 'thumbnail' && item.thumbnailLimit === thumbnailLimit)
  const fpsDrop = (baseline.medianFps - candidate.medianFps) / baseline.medianFps
  return fpsDrop <= 0.05 && candidate.medianLongTasks <= baseline.medianLongTasks && candidate.fingerprintChanged
}))
const selectedThumbnailDrawLimit = acceptedLimits.at(-1) ?? 0
const result = {
  generatedAt: new Date().toISOString(),
  browser: await page.evaluate(() => navigator.userAgent),
  methodology: { nodeCounts, thumbnailLimits, repetitions, frameCount, longFrameMs },
  selectedThumbnailDrawLimit,
  scenarios,
}
await browser.close()

const here = path.dirname(fileURLToPath(import.meta.url))
const resultPath = path.join(here, 'minimap-performance-results.json')
await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`)
console.log(`SELECTED=${selectedThumbnailDrawLimit}`)
console.log(`RESULT=${resultPath}`)
