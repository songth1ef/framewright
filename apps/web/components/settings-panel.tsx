'use client'

/**
 * 统一设置中心。所有配置只在这一处改。
 *
 * 设计取舍：
 * - **先给推荐，再给旋钮**。多数人不想理解 maxNodes 是什么，只想「按我的机器给个合适的」。
 *   所以顶部是设备检测 + 推荐预设，高级参数默认折叠。
 * - **每个参数都写清它管什么、以及调它的代价**。没有说明的数字旋钮等于让人乱调。
 * - **非法组合当场拦截并说明原因**，不等保存后画布进入无法解释的状态。
 */
import { useEffect, useMemo, useState } from 'react'
import {
  PERFORMANCE_PRESETS,
  detectDeviceCapability,
  isPerformanceProfile,
  matchPreset,
  recommendPreset,
  type DeviceCapability,
  type PerformanceProfile,
  type PerformancePresetKey,
  type PresetRecommendation,
} from '@framewright/core'
import {
  DEFAULT_SETTINGS,
  loadSettings,
  resetSettings,
  saveSettings,
  type AppSettings,
} from './settings-store'

const PRESET_LABELS: Record<PerformancePresetKey, { name: string; hint: string }> = {
  battery: { name: '省电 / 低配', hint: '优先保证不卡，缩小时更早简化' },
  balanced: { name: '均衡', hint: '默认档，与调优基准一致' },
  quality: { name: '高画质', hint: '更晚降级，缩小时仍看得出内容' },
  ultra: { name: '极致', hint: '几乎不降级，需要高核心数与大内存' },
}

const FIELDS: Array<{
  key: keyof PerformanceProfile
  label: string
  step: number
  describe: string
  cost: string
}> = [
  {
    key: 'maxNodes', label: '最多挂载节点数', step: 100,
    describe: '超出后只保留离视口中心最近的那些。',
    cost: '调大 → 大画布上首屏更慢、内存更高；实测 2535 节点时 DOM 已降到 24fps。',
  },
  {
    key: 'maxConnections', label: '最多渲染连线数', step: 100,
    describe: '0 表示完全不画连线。',
    cost: '连线是实测中最大的性能杠杆：同样 1499 节点，有无 1000 条线差 22.54 vs 44.09 fps。',
  },
  {
    key: 'overscan', label: '预挂载视口圈数', step: 1,
    describe: '在可视区外多挂几圈，平移时不容易看到空白。',
    cost: '每加一圈，挂载面积约增至 (2n+1)² 倍。',
  },
  {
    key: 'minScale', label: '最小缩放', step: 0.005,
    describe: '能缩到多小。0.01 = 1%。',
    cost: '缩得越小，同屏节点越多。',
  },
  {
    key: 'maxScale', label: '最大缩放', step: 1,
    describe: '能放到多大。8 = 800%。',
    cost: '放大到需要更高分辨率时会请求更大的原图。',
  },
  {
    key: 'fullDetailScale', label: '完整细节阈值', step: 0.05,
    describe: '缩放大于等于该值时显示完整内容。',
    cost: '调低 → 缩小时仍渲染完整卡片，更清楚但更吃力。',
  },
  {
    key: 'simplifiedDetailScale', label: '简化细节阈值', step: 0.02,
    describe: '低于该值时卡片退化为色块 —— 「缩小后全是纯色方块」就是落到了这一档。',
    cost: '调低 → 缩得很小时仍保留形态，代价是低缩放下负载明显上升。',
  },
]

export function SettingsPanel(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [capability, setCapability] = useState<DeviceCapability | null>(null)
  const [recommendation, setRecommendation] = useState<PresetRecommendation | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    setSettings(loadSettings())
    const detected = detectDeviceCapability()
    setCapability(detected)
    setRecommendation(recommendPreset(detected))
  }, [])

  const activePreset = useMemo(() => matchPreset(settings.performance), [settings.performance])
  const invalid = !isPerformanceProfile(settings.performance)

  function update(next: AppSettings): void {
    setSettings(next)
    if (isPerformanceProfile(next.performance)) {
      saveSettings(next)
      setSavedAt(Date.now())
    }
  }

  function applyPreset(key: PerformancePresetKey): void {
    update({ ...settings, performance: PERFORMANCE_PRESETS[key], performancePreset: key })
  }

  function setField(key: keyof PerformanceProfile, raw: string): void {
    const value = Number(raw)
    if (!Number.isFinite(value)) return
    update({
      ...settings,
      performance: { ...settings.performance, [key]: value },
      performancePreset: 'custom',
    })
  }

  return (
    <main data-testid="settings-page" style={{ maxWidth: 860, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>设置</h1>
        <a href="/" data-testid="settings-back" style={{ fontSize: 13 }}>← 返回画布列表</a>
      </header>
      <p style={{ color: '#5A5A66', fontSize: 13, marginTop: 0 }}>
        所有配置在此统一管理，改动即时保存在本机浏览器，不上传服务器。
      </p>

      <section style={sectionStyle} data-testid="device-section">
        <h2 style={h2Style}>你的设备</h2>
        {capability === null ? <p style={mutedStyle}>检测中…</p> : (
          <>
            <dl style={dlStyle}>
              <Row label="CPU 核心" value={capability.cpuCores ?? '浏览器未提供'} />
              <Row label="内存" value={capability.deviceMemoryGb === null
                ? '浏览器未提供（Safari / Firefox 不支持）' : `${capability.deviceMemoryGb} GB`} />
              <Row label="像素密度" value={`${capability.devicePixelRatio}x`} />
              <Row label="图形" value={capability.gpuRenderer ?? '未提供'} />
            </dl>
            {recommendation !== null && (
              <div data-testid="recommendation" style={{
                background: '#F2F7FF', border: '1px solid #CFE0FF', borderRadius: 8, padding: 12,
              }}>
                <strong>推荐：{PRESET_LABELS[recommendation.preset].name}</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, color: '#41414D' }}>
                  {recommendation.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
                {recommendation.uncertain && (
                  <p style={{ ...mutedStyle, marginBottom: 0 }}>
                    ⚠️ 部分硬件信息浏览器未提供，该推荐依据不足，已偏保守。
                  </p>
                )}
                <button
                  type="button"
                  data-testid="apply-recommendation"
                  onClick={() => applyPreset(recommendation.preset)}
                  style={{ ...buttonStyle, marginTop: 8 }}
                >应用推荐</button>
              </div>
            )}
          </>
        )}
      </section>

      <section style={sectionStyle} data-testid="preset-section">
        <h2 style={h2Style}>画质预设</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
          {(Object.keys(PRESET_LABELS) as PerformancePresetKey[]).map((key) => (
            <button
              key={key}
              type="button"
              data-testid={`preset-${key}`}
              aria-pressed={activePreset === key}
              onClick={() => applyPreset(key)}
              style={{
                ...buttonStyle,
                textAlign: 'left',
                borderColor: activePreset === key ? '#4C8BF5' : '#D8D8DE',
                background: activePreset === key ? '#EEF4FF' : '#FFF',
              }}
            >
              <div style={{ fontWeight: 600 }}>{PRESET_LABELS[key].name}</div>
              <div style={{ fontSize: 12, color: '#5A5A66' }}>{PRESET_LABELS[key].hint}</div>
            </button>
          ))}
        </div>
        <p style={mutedStyle} data-testid="active-preset">
          当前：{activePreset === null ? '自定义' : PRESET_LABELS[activePreset].name}
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>渲染与交互</h2>
        <Choice label="渲染器" testId="setting-renderer"
          value={settings.renderer}
          options={[['dom', 'HTML / DOM（推荐）'], ['leafer', 'LeaferJS（Canvas）']]}
          onChange={(v) => update({ ...settings, renderer: v as AppSettings['renderer'] })}
          hint="视频维度实测 DOM 占优；节点数量维度 Leafer 内存更省。" />
        <Choice label="交互实现" testId="setting-interaction"
          value={settings.interactionMode}
          options={[['unified', '统一（两个渲染器行为一致）'], ['native', '原生（各用各的事件系统）']]}
          onChange={(v) => update({ ...settings, interactionMode: v as AppSettings['interactionMode'] })}
          hint="统一模式保证两侧可对照；原生模式各自跑在自己的天花板上。" />
        <Choice label="连线" testId="setting-connections"
          value={settings.connectionVisibility}
          options={[['visible', '显示'], ['hidden', '隐藏']]}
          onChange={(v) => update({
            ...settings, connectionVisibility: v as AppSettings['connectionVisibility'],
          })}
          hint="大画布上隐藏连线是最有效的提速手段。" />
        <Toggle label="小地图" testId="setting-minimap" checked={settings.minimapVisible}
          onChange={(checked) => update({ ...settings, minimapVisible: checked })} />
        <Toggle label="帧率监视器" testId="setting-fps" checked={settings.fpsMonitorVisible}
          onChange={(checked) => update({ ...settings, fpsMonitorVisible: checked })} />
      </section>

      <section style={sectionStyle}>
        <button type="button" data-testid="toggle-advanced" onClick={() => setAdvancedOpen(!advancedOpen)}
          style={{ ...buttonStyle, width: '100%', textAlign: 'left' }}>
          {advancedOpen ? '▾' : '▸'} 高级参数（{FIELDS.length} 项）
        </button>
        {advancedOpen && (
          <div style={{ marginTop: 12 }}>
            {FIELDS.map((field) => (
              <div key={field.key} style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 2 }}>
                  {field.label}
                  <input
                    type="number"
                    data-testid={`field-${field.key}`}
                    step={field.step}
                    value={settings.performance[field.key]}
                    onChange={(event) => setField(field.key, event.target.value)}
                    style={{ marginLeft: 10, width: 120, padding: '4px 6px' }}
                  />
                </label>
                <div style={{ fontSize: 12, color: '#5A5A66' }}>{field.describe}</div>
                <div style={{ fontSize: 12, color: '#8A6D3B' }}>代价：{field.cost}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {invalid && (
        <p data-testid="settings-invalid" style={{ color: '#B4232C', fontWeight: 600 }}>
          当前组合不合法，尚未保存：最小缩放必须小于最大缩放，简化阈值必须小于完整阈值，
          且各项需在允许范围内。
        </p>
      )}

      <footer style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 20 }}>
        <button type="button" data-testid="reset-settings"
          onClick={() => setSettings(resetSettings())} style={buttonStyle}>恢复默认</button>
        {savedAt !== null && !invalid && (
          <span data-testid="settings-saved" style={mutedStyle}>已保存</span>
        )}
      </footer>
    </main>
  )
}

function Row({ label, value }: { label: string; value: string | number }): React.JSX.Element {
  return (
    <>
      <dt style={{ color: '#5A5A66' }}>{label}</dt>
      <dd style={{ margin: '0 0 6px' }}>{value}</dd>
    </>
  )
}

function Choice({ label, testId, value, options, onChange, hint }: {
  label: string; testId: string; value: string
  options: Array<[string, string]>; onChange: (value: string) => void; hint: string
}): React.JSX.Element {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontWeight: 600 }}>
        {label}
        <select data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)}
          style={{ marginLeft: 10, padding: '4px 6px' }}>
          {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
        </select>
      </label>
      <div style={{ fontSize: 12, color: '#5A5A66' }}>{hint}</div>
    </div>
  )
}

function Toggle({ label, testId, checked, onChange }: {
  label: string; testId: string; checked: boolean; onChange: (checked: boolean) => void
}): React.JSX.Element {
  return (
    <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
      <input type="checkbox" data-testid={testId} checked={checked}
        onChange={(e) => onChange(e.target.checked)} style={{ marginRight: 8 }} />
      {label}
    </label>
  )
}

const sectionStyle: React.CSSProperties = {
  border: '1px solid #E4E4EA', borderRadius: 10, padding: 16, marginBottom: 16,
}
const h2Style: React.CSSProperties = { fontSize: 15, margin: '0 0 10px' }
const mutedStyle: React.CSSProperties = { fontSize: 12, color: '#5A5A66', margin: '8px 0 0' }
const dlStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0 12px', fontSize: 13, margin: '0 0 12px',
}
const buttonStyle: React.CSSProperties = {
  border: '1px solid #D8D8DE', borderRadius: 8, padding: '8px 12px', background: '#FFF', cursor: 'pointer',
}
