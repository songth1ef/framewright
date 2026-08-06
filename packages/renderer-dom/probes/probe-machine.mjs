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
