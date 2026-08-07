/**
 * 探针结果的机器口径。
 *
 * 🔴 为什么必须记：仓里的 probes/results 曾同时混着 Windows 与 macOS 两台机器的数据，
 * 而文件名与顶层字段完全看不出来 —— 机器信息只藏在每个 sample 的 browser UA 串里。
 * 顺手拿两份对比就会把机器差异当成代码效果（2026-08-06 实际发生过一次：
 * 首屏「减半」与平移 fps「提升」全部来自换机器，同机对照下改动其实零影响）。
 *
 * 与 workload 并列：workload 记负载口径，machine 记机器口径。两者都对上才可比。
 */
import os from 'node:os'

export function describeMachine() {
  const cpus = os.cpus()
  return {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpuModel: cpus[0]?.model ?? null,
    cpuCount: cpus.length,
    totalMemoryBytes: os.totalmem(),
  }
}

/**
 * 🔴 采样当刻的机器负载。
 *
 * describeMachine 记的是**静态硬件**，回答不了「这次跑的时候机器忙不忙」。
 * 这个盲区已经咬过两次：
 *  ① minimap e2e 稳定失败，一度当成真回归，实际是 load average 从 16 冲到 110；
 *  ② React Flow A-n100-z800 五次里两次 timeout，而 pan 实测只要 3 秒、预算 120 秒 ——
 *     40 倍余量下超时只可能是机器整体卡住，但当时没记负载，事后无从证实。
 *
 * 超时与失败样本必须带上它，否则「环境问题」和「代码问题」永远分不开。
 */
export function describeLoad() {
  return {
    loadAverage: os.loadavg().map((value) => Number(value.toFixed(2))),
    freeMemoryBytes: os.freemem(),
    capturedAt: new Date().toISOString(),
  }
}
