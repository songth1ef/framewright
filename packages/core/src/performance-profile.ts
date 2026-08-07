/**
 * 性能画质档案：把此前散落且写死的性能参数收成一份可配置、可持久化的档案，
 * 并按设备能力给推荐 —— 形态对标游戏的「低/中/高/极致」画质预设。
 *
 * 🔴 为什么要做成档案而不是继续散着：
 * 这些参数此前分布在三处且互相不知道对方存在 ——
 *   - `viewport-culling.ts` 的 DEFAULT_MAX_NODES / DEFAULT_MAX_CONNECTIONS
 *   - `viewport-lod.ts` 里写死的 0.5 / 0.2 档位阈值
 *   - 画布 UI 里写死的缩放上下限
 * 而它们描述的是**同一件事**：这台机器愿意为一帧付出多少。分开配就必然出现
 * 「预算调大了但 LOD 还在早早降级」这类互相打架的组合。
 *
 * ⚠️ 一条纪律：预设值是**有依据的**，不是拍脑袋。每个数字后面都标了它来自哪次实测。
 * 没有实测依据的参数宁可不放进预设，也不要编一个看起来很专业的数字。
 */

export interface PerformanceProfile {
  /** 最多挂载多少节点（含 root）。超出时按到视口中心的归一化距离取最近的。 */
  maxNodes: number
  /**
   * 低细节档（缩放低于 simplifiedDetailScale，节点已退化为色块/点）时的挂载上限。
   *
   * 🔴 为什么要和 maxNodes 分开：10% 缩放下每个节点只是个小方块，成本比 100% 时
   * 低一个量级，能承受的数量完全不同。共用一个预算的后果，正是用户看到的
   * 「缩到 10% 时中间一块有内容、外面整片消失」—— 上限是按满细节定的，
   * 到了低细节档就显得过于保守。
   *
   * 反过来也成立：在弱机器上可以把这一档压得比 maxNodes 更低，
   * 因为低缩放意味着同屏候选节点暴涨。
   */
  lowDetailMaxNodes: number
  /** 最多渲染多少条连线。0 表示不渲染连线。 */
  maxConnections: number
  /** 向四周预挂载多少个视口尺寸。0 = 只挂当前视口相交项。 */
  overscan: number
  /** 缩放下限（0.01 = 1%）。 */
  minScale: number
  /** 缩放上限（8 = 800%）。 */
  maxScale: number
  /** 大于等于该缩放用完整细节。 */
  fullDetailScale: number
  /** 大于等于该缩放用简化细节，低于则退化为色块/点。 */
  simplifiedDetailScale: number
}

export type PerformancePresetKey = 'battery' | 'balanced' | 'quality' | 'ultra'

/**
 * 四档预设。
 *
 * 依据来自本仓已入库的实测：
 * - `maxNodes` 1500：2535 个节点时 DOM 已降至 24fps，1500 为该实测拐点留约 40% 余量
 *   （见 viewport-culling.ts）。低档取一半，高档按余量放宽。
 * - `maxConnections` 1000：100% 缩放实测 367 条连线可流畅运行，1000 留约 2.7 倍余量。
 *   连线是实测中**最大的性能杠杆**（1499 节点，有无 1000 条线差 22.54 vs 44.09 fps），
 *   所以低档把它压得最狠。
 * - LOD 阈值 0.5 / 0.2：以常见 120×80 节点反推，50% 时仍有 60×40px 足够完整内容，
 *   20% 时仅 24×16px 只值得保留轮廓。
 * - `maxScale` 8：素材最高 4K，配合 16× 请求档位在 800% 时正好取到原图分辨率。
 */
export const PERFORMANCE_PRESETS: Readonly<Record<PerformancePresetKey, PerformanceProfile>> =
  Object.freeze({
    // 省电/低配：优先保证不卡，接受更早降级
    battery: Object.freeze({
      maxNodes: 600,
      lowDetailMaxNodes: 1500,
      maxConnections: 200,
      overscan: 0,
      minScale: 0.02,
      maxScale: 4,
      fullDetailScale: 0.75,
      simplifiedDetailScale: 0.3,
    }),
    // 均衡：与本仓此前的写死默认值一致，保证升级到配置系统后行为不变
    balanced: Object.freeze({
      maxNodes: 1500,
      lowDetailMaxNodes: 4000,
      maxConnections: 1000,
      overscan: 1,
      minScale: 0.01,
      maxScale: 8,
      fullDetailScale: 0.5,
      simplifiedDetailScale: 0.2,
    }),
    // 高画质：更晚降级，看得更清，代价是低缩放下更吃力
    quality: Object.freeze({
      maxNodes: 3000,
      lowDetailMaxNodes: 8000,
      maxConnections: 2000,
      overscan: 1,
      minScale: 0.01,
      maxScale: 8,
      fullDetailScale: 0.35,
      simplifiedDetailScale: 0.12,
    }),
    // 极致：几乎不降级。仅在高核心数 + 大内存机器上推荐
    ultra: Object.freeze({
      maxNodes: 6000,
      lowDetailMaxNodes: 20000,
      maxConnections: 4000,
      overscan: 2,
      minScale: 0.005,
      maxScale: 16,
      fullDetailScale: 0.25,
      simplifiedDetailScale: 0.06,
    }),
  })

export const DEFAULT_PERFORMANCE_PRESET: PerformancePresetKey = 'balanced'

export interface DeviceCapability {
  /** navigator.hardwareConcurrency。取不到为 null —— **「取不到」和「是 0」必须区别对待**。 */
  cpuCores: number | null
  /** navigator.deviceMemory（GB）。Safari/Firefox 不支持，为 null。 */
  deviceMemoryGb: number | null
  devicePixelRatio: number
  /** WebGL 的 UNMASKED_RENDERER_WEBGL。拿不到（隐私模式/无 WebGL）为 null。 */
  gpuRenderer: string | null
  /** 软件渲染（SwiftShader / llvmpipe / SwANGLE）时为 true —— 这类机器要按最低档待遇。 */
  softwareRendered: boolean
}

/** 只读浏览器已公开的信息，不做指纹级探测。服务端调用会得到全 null 的保守结果。 */
export function detectDeviceCapability(): DeviceCapability {
  if (typeof navigator === 'undefined') {
    return {
      cpuCores: null,
      deviceMemoryGb: null,
      devicePixelRatio: 1,
      gpuRenderer: null,
      softwareRendered: false,
    }
  }
  const nav = navigator as Navigator & { deviceMemory?: number }
  const gpuRenderer = readGpuRenderer()
  return {
    cpuCores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    deviceMemoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    devicePixelRatio: typeof window === 'undefined' ? 1 : (window.devicePixelRatio || 1),
    gpuRenderer,
    softwareRendered: gpuRenderer !== null && /swiftshader|llvmpipe|swangle|software/i.test(gpuRenderer),
  }
}

function readGpuRenderer(): string | null {
  try {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') as WebGLRenderingContext | null
    if (gl === null) return null
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    if (ext === null) return null
    const value = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

export interface PresetRecommendation {
  preset: PerformancePresetKey
  /** 逐条说明为什么推荐它。**不解释的推荐等于让用户盲选**。 */
  reasons: string[]
  /** 关键信息缺失时为 true —— 此时推荐偏保守，且要让用户知道依据不足。 */
  uncertain: boolean
}

/**
 * 按设备能力推荐预设。
 *
 * 🔴 缺信息时**往保守方向靠，并明确标注 uncertain**，而不是假装有依据。
 * Safari 与 Firefox 都不提供 deviceMemory，这不是罕见情况。
 */
export function recommendPreset(capability: DeviceCapability): PresetRecommendation {
  const reasons: string[] = []

  if (capability.softwareRendered) {
    reasons.push(`检测到软件渲染（${capability.gpuRenderer ?? '未知'}），无硬件加速，按最低档处理`)
    return { preset: 'battery', reasons, uncertain: false }
  }

  const cores = capability.cpuCores
  const memory = capability.deviceMemoryGb
  const uncertain = cores === null || memory === null
  if (cores === null) reasons.push('浏览器未提供 CPU 核心数，按保守估计')
  if (memory === null) reasons.push('浏览器未提供内存信息（Safari / Firefox 不支持），按保守估计')

  // 两项都很强才给最高档：本仓实测万节点画布 renderer 进程 RSS 可达 +312MB，
  // 内存不足时最先出问题的不是帧率，是整个标签页被系统回收。
  if (cores !== null && memory !== null && cores >= 10 && memory >= 8) {
    reasons.push(`${cores} 核 / ${memory}GB 内存，可承担最高细节`)
    return { preset: 'ultra', reasons, uncertain }
  }
  if ((cores ?? 4) >= 8 && (memory ?? 4) >= 8) {
    reasons.push(`${cores ?? '未知'} 核 / ${memory ?? '未知'}GB 内存，可承担较高细节`)
    return { preset: 'quality', reasons, uncertain }
  }
  if ((cores ?? 4) <= 4 || (memory ?? 4) <= 4) {
    reasons.push(`${cores ?? '未知'} 核 / ${memory ?? '未知'}GB 内存偏低，优先保证流畅`)
    return { preset: 'battery', reasons, uncertain }
  }
  reasons.push('设备处于中间区间，使用均衡档')
  return { preset: 'balanced', reasons, uncertain }
}

const NUMERIC_BOUNDS: Record<keyof PerformanceProfile, { min: number; max: number; integer: boolean }> = {
  maxNodes: { min: 1, max: 100_000, integer: true },
  lowDetailMaxNodes: { min: 1, max: 200_000, integer: true },
  maxConnections: { min: 0, max: 100_000, integer: true },
  overscan: { min: 0, max: 4, integer: true },
  minScale: { min: 0.001, max: 1, integer: false },
  maxScale: { min: 1, max: 64, integer: false },
  fullDetailScale: { min: 0.01, max: 4, integer: false },
  simplifiedDetailScale: { min: 0.001, max: 4, integer: false },
}

/**
 * 校验一份档案是否可用。
 *
 * 除逐项范围外还查**跨项一致性**：单项都合法但组合起来自相矛盾的配置
 * （下限比上限大、简化档阈值比完整档还高）会让画布进入无法解释的状态，
 * 而这类错误只在特定缩放下才显形，极难排查。
 */
export function isPerformanceProfile(value: unknown): value is PerformanceProfile {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  for (const [key, bound] of Object.entries(NUMERIC_BOUNDS)) {
    const raw = candidate[key]
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return false
    if (bound.integer && !Number.isSafeInteger(raw)) return false
    if (raw < bound.min || raw > bound.max) return false
  }
  const profile = candidate as unknown as PerformanceProfile
  if (profile.minScale >= profile.maxScale) return false
  if (profile.simplifiedDetailScale >= profile.fullDetailScale) return false
  return true
}

/** 找出与给定档案完全相同的预设；自定义档案返回 null。 */
export function matchPreset(profile: PerformanceProfile): PerformancePresetKey | null {
  for (const [key, preset] of Object.entries(PERFORMANCE_PRESETS)) {
    const same = (Object.keys(NUMERIC_BOUNDS) as (keyof PerformanceProfile)[])
      .every((field) => preset[field] === profile[field])
    if (same) return key as PerformancePresetKey
  }
  return null
}
