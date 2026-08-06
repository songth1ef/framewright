import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PERFORMANCE_PRESET,
  PERFORMANCE_PRESETS,
  isPerformanceProfile,
  matchPreset,
  recommendPreset,
  type DeviceCapability,
  type PerformanceProfile,
} from './performance-profile'
import { DEFAULT_VIEWPORT_CULLING_LIMITS } from './viewport-culling'
import { getViewportLod } from './viewport-lod'

const capability = (patch: Partial<DeviceCapability> = {}): DeviceCapability => ({
  cpuCores: 8,
  deviceMemoryGb: 8,
  devicePixelRatio: 2,
  gpuRenderer: 'Apple M4',
  softwareRendered: false,
  ...patch,
})

describe('性能画质档案', () => {
  // 🔴 这条守的是「上配置系统不改变现有行为」。均衡档一旦与旧的写死默认值漂移，
  // 所有已入库的基准数据就不再对应默认配置,而没人会立刻发现。
  it('均衡档与配置系统落地前的写死默认值完全一致', () => {
    const balanced = PERFORMANCE_PRESETS.balanced
    expect(DEFAULT_PERFORMANCE_PRESET).toBe('balanced')
    expect(balanced.maxNodes).toBe(DEFAULT_VIEWPORT_CULLING_LIMITS.maxNodes)
    expect(balanced.maxConnections).toBe(DEFAULT_VIEWPORT_CULLING_LIMITS.maxConnections)
    expect(balanced.fullDetailScale).toBe(0.5)
    expect(balanced.simplifiedDetailScale).toBe(0.2)
  })

  it('四档预设都自洽，且细节按档位单调放宽', () => {
    const order = ['battery', 'balanced', 'quality', 'ultra'] as const
    for (const key of order) expect(isPerformanceProfile(PERFORMANCE_PRESETS[key])).toBe(true)
    for (let i = 1; i < order.length; i += 1) {
      const lower = PERFORMANCE_PRESETS[order[i - 1]!]
      const higher = PERFORMANCE_PRESETS[order[i]!]
      expect(higher.maxNodes).toBeGreaterThan(lower.maxNodes)
      expect(higher.maxConnections).toBeGreaterThan(lower.maxConnections)
      // 档位越高越晚降级 → 阈值越小
      expect(higher.fullDetailScale).toBeLessThan(lower.fullDetailScale)
      expect(higher.simplifiedDetailScale).toBeLessThan(lower.simplifiedDetailScale)
    }
  })

  it('拒绝单项合法但组合自相矛盾的档案', () => {
    const base = PERFORMANCE_PRESETS.balanced
    expect(isPerformanceProfile({ ...base, minScale: 9, maxScale: 8 })).toBe(false)
    expect(isPerformanceProfile({ ...base, simplifiedDetailScale: 0.9, fullDetailScale: 0.5 }))
      .toBe(false)
    expect(isPerformanceProfile({ ...base, maxNodes: 0 })).toBe(false)
    expect(isPerformanceProfile({ ...base, maxNodes: 1.5 })).toBe(false)
    expect(isPerformanceProfile(null)).toBe(false)
  })

  it('matchPreset 认得出预设，自定义档案返回 null', () => {
    expect(matchPreset(PERFORMANCE_PRESETS.quality)).toBe('quality')
    const custom: PerformanceProfile = { ...PERFORMANCE_PRESETS.quality, maxNodes: 2999 }
    expect(matchPreset(custom)).toBeNull()
  })

  describe('按设备推荐', () => {
    it('软件渲染一律按最低档，且不标记为「依据不足」', () => {
      const result = recommendPreset(capability({
        gpuRenderer: 'SwiftShader Device (LLVM 10.0.0)',
        softwareRendered: true,
      }))
      expect(result.preset).toBe('battery')
      expect(result.uncertain).toBe(false)
      expect(result.reasons.join()).toContain('软件渲染')
    })

    it('高核心 + 大内存推荐极致', () => {
      expect(recommendPreset(capability({ cpuCores: 10, deviceMemoryGb: 8 })).preset).toBe('ultra')
    })

    it('低核心或小内存推荐省电档', () => {
      expect(recommendPreset(capability({ cpuCores: 4 })).preset).toBe('battery')
      expect(recommendPreset(capability({ deviceMemoryGb: 4 })).preset).toBe('battery')
    })

    // Safari 与 Firefox 都不提供 deviceMemory,这不是罕见情况。
    // 缺信息时必须标 uncertain 并说明,而不是给一个看似确定的推荐。
    it('信息缺失时偏保守并标注依据不足', () => {
      const result = recommendPreset(capability({ deviceMemoryGb: null }))
      expect(result.uncertain).toBe(true)
      expect(result.reasons.join()).toContain('未提供内存')
      expect(result.preset).not.toBe('ultra')
    })

    it('每条推荐都带理由，不让用户盲选', () => {
      for (const patch of [{}, { cpuCores: 2 }, { cpuCores: null }, { softwareRendered: true }]) {
        expect(recommendPreset(capability(patch)).reasons.length).toBeGreaterThan(0)
      }
    })
  })

  describe('LOD 阈值可配置', () => {
    it('不传阈值时与配置系统落地前行为完全一致', () => {
      expect(getViewportLod(0.5).detail).toBe('full')
      expect(getViewportLod(0.49).detail).toBe('simplified')
      expect(getViewportLod(0.2).detail).toBe('simplified')
      expect(getViewportLod(0.19).detail).toBe('dot')
    })

    it('高画质档把降级点推得更低，同一缩放下看到更多细节', () => {
      const quality = PERFORMANCE_PRESETS.quality
      // 40% 缩放：均衡档(阈值 0.5)已简化，高画质档(阈值 0.35)仍完整
      expect(getViewportLod(0.4).detail).toBe('simplified')
      expect(getViewportLod(0.4, quality).detail).toBe('full')
      // 15% 缩放：均衡档(阈值 0.2)退化成点，高画质档(阈值 0.12)仍保留简化形态 ——
      // 这正是用户反馈「缩小后全变纯色方块」时想要的档位
      expect(getViewportLod(0.15).detail).toBe('dot')
      expect(getViewportLod(0.15, quality).detail).toBe('simplified')
    })

    it('省电档更早降级', () => {
      const battery = PERFORMANCE_PRESETS.battery
      expect(getViewportLod(0.6).detail).toBe('full')
      expect(getViewportLod(0.6, battery).detail).toBe('simplified')
    })
  })
})
