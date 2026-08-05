import { SHORTCUT_GROUPS } from './shortcut-help'

export function EmptyCanvasGuide() {
  return (
    <div
      data-testid="empty-canvas-guide"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 2,
        display: 'grid',
        placeItems: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          maxWidth: 360,
          padding: '24px 28px',
          border: '1px dashed #cbd5e1',
          borderRadius: 16,
          color: '#475467',
          background: 'rgba(255, 255, 255, 0.92)',
          textAlign: 'center',
          boxShadow: '0 8px 24px rgba(16, 24, 40, 0.08)',
        }}
      >
        <div style={{ marginBottom: 8, color: '#101828', fontSize: 16, fontWeight: 650 }}>
          这张画布还没有内容
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          开始生成后，图片和视频结果会出现在这里，供你继续摆放和再生成。
        </div>
      </div>
    </div>
  )
}

export function ShortcutHelpDialog({ onClose }: { onClose(): void }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'rgba(16, 24, 40, 0.42)',
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-help-title"
        style={{
          width: 'min(680px, 100%)',
          maxHeight: 'min(720px, calc(100vh - 48px))',
          overflow: 'auto',
          borderRadius: 16,
          background: '#fff',
          boxShadow: '0 24px 64px rgba(16, 24, 40, 0.28)',
        }}
      >
        <header
          style={{
            position: 'sticky',
            top: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 20px',
            borderBottom: '1px solid #eaecf0',
            background: '#fff',
          }}
        >
          <div>
            <h2 id="shortcut-help-title" style={{ margin: 0, color: '#101828', fontSize: 18 }}>
              键盘快捷键
            </h2>
            <p style={{ margin: '4px 0 0', color: '#667085', fontSize: 12 }}>
              输入框获得焦点时，画布不会接管这些按键。
            </p>
          </div>
          <button
            type="button"
            autoFocus
            aria-label="关闭快捷键帮助"
            onClick={onClose}
            style={{
              width: 34,
              height: 34,
              border: 0,
              borderRadius: 8,
              color: '#475467',
              background: '#f2f4f7',
              fontSize: 20,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </header>
        <div style={{ display: 'grid', gap: 22, padding: 20 }}>
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.label} aria-labelledby={`shortcut-group-${group.label}`}>
              <h3
                id={`shortcut-group-${group.label}`}
                style={{ margin: '0 0 8px', color: '#344054', fontSize: 13 }}
              >
                {group.label}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                {group.items.map((item) => (
                  <div
                    key={item.action}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      minHeight: 38,
                      padding: '6px 10px',
                      borderRadius: 8,
                      background: '#f9fafb',
                    }}
                  >
                    <span style={{ color: '#475467', fontSize: 13 }}>{item.action}</span>
                    <span style={{ display: 'flex', gap: 4 }}>
                      {item.keys.map((key) => (
                        <kbd
                          key={key}
                          style={{
                            padding: '2px 6px',
                            border: '1px solid #d0d5dd',
                            borderBottomWidth: 2,
                            borderRadius: 5,
                            color: '#344054',
                            background: '#fff',
                            font: '12px system-ui, sans-serif',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {key}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  )
}
