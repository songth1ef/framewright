/**
 * 真实进程内存采样。
 *
 * 🔴 本仓此前一律记 `memory: null`，理由是「页面级 API 无法可靠覆盖 DOM、布局、
 * 合成层与浏览器进程总内存；performance.memory 仅代表部分 JS heap」。那个判断对
 * **页面级 API** 成立，但不等于测不到 —— 换一条路就能拿到：
 *
 *   CDP `SystemInfo.getProcessInfo` → 分进程 PID（browser / renderer / GPU / network）
 *   再用 `ps -o rss=` 从操作系统读该 PID 的真实 RSS
 *
 * 实测有效（2026-08-06，M4 Mac）：空页面 renderer 76.3MB，压入 50 万对象 + 大量
 * canvas 绘制后升到 233.1MB。**对负载有反应**，不是常数。
 *
 * ⚠️ 两条必须随数据一起记的限制：
 *
 * 1. **headless 下 GPU 进程没有意义**。`SystemInfo.getInfo` 显示渲染走的是
 *    SwiftShader（软件光栅化），Canvas 的活全在 renderer 进程里做，GPU 进程 RSS
 *    在上述实测中只动了 0.08MB。要看真实显存必须跑有头浏览器 + 真实 GPU。
 * 2. **RSS 不等于「这个页面用了多少」**：包含共享库与浏览器自身开销。只应做
 *    **同一进程、同一档位下的前后对比**，不要拿绝对值当结论。
 */
import { execFileSync } from 'node:child_process'

/** 读单个 PID 的 RSS（字节）。读不到返回 null —— 进程可能已退出，那是正常的。 */
function readRssBytes(pid) {
  try {
    const out = execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' })
    const kib = Number(out.trim())
    return Number.isFinite(kib) && kib > 0 ? kib * 1024 : null
  } catch {
    return null
  }
}

/**
 * 采一份分进程内存快照。
 * @param {import('@playwright/test').CDPSession} browserCdp 浏览器级 CDP（newBrowserCDPSession）
 */
export async function sampleProcessMemory(browserCdp) {
  let processInfo
  try {
    ;({ processInfo } = await browserCdp.send('SystemInfo.getProcessInfo'))
  } catch (error) {
    return { available: false, reason: `SystemInfo.getProcessInfo 不可用：${error.message}` }
  }
  const byType = {}
  for (const entry of processInfo) {
    // 同类型可能多进程（多个 renderer）；累加 RSS，并记下进程数以免被误读成单进程。
    const current = byType[entry.type] ?? { pids: [], rssBytes: 0, cpuTimeSeconds: 0 }
    const rss = readRssBytes(entry.id)
    current.pids.push(entry.id)
    if (rss !== null) current.rssBytes += rss
    current.cpuTimeSeconds += entry.cpuTime ?? 0
    byType[entry.type] = current
  }
  return {
    available: true,
    unit: 'bytes',
    source: 'CDP SystemInfo.getProcessInfo 取 PID + ps -o rss=',
    caveats: [
      'headless 使用 SwiftShader 软件光栅化，GPU 进程 RSS 不反映真实显存',
      'RSS 含共享库与浏览器自身开销，只做同档位前后对比，不作绝对值结论',
    ],
    byProcess: byType,
  }
}

/** 页面级补充指标：JS heap 与 DOM 计数。**与进程 RSS 分开记，绝不混为一谈**。 */
export async function samplePageMetrics(pageCdp) {
  try {
    await pageCdp.send('Performance.enable')
    const { metrics } = await pageCdp.send('Performance.getMetrics')
    const wanted = new Set([
      'JSHeapUsedSize', 'JSHeapTotalSize', 'Nodes', 'Documents', 'Frames',
      'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration',
      'LayoutCount', 'RecalcStyleCount',
    ])
    const picked = {}
    for (const metric of metrics) if (wanted.has(metric.name)) picked[metric.name] = metric.value
    return picked
  } catch (error) {
    return { unavailableReason: error.message }
  }
}
