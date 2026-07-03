export default function Settings({ theme, toggleTheme, onBack }) {
  return (
    <div className="section" style={{ maxWidth: 560 }}>
      <button className="link-btn" onClick={onBack}>← Back</button>
      <h2 style={{ marginBottom: 6 }}>Settings</h2>
      <p className="muted" style={{ marginBottom: 24 }}>Manage your app preferences.</p>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--hover-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
            {theme === 'light' ? '🌙' : '☀️'}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-strong)' }}>Appearance</div>
            <div className="muted" style={{ fontSize: 13 }}>{theme === 'light' ? 'Light mode is on' : 'Dark mode is on'}</div>
          </div>
        </div>
        <button
          onClick={toggleTheme}
          style={{
            width: 52, height: 30, borderRadius: 20, border: 'none', cursor: 'pointer',
            background: theme === 'dark' ? '#1D9E75' : 'var(--border)',
            position: 'relative', transition: 'background 0.2s', flexShrink: 0,
          }}
        >
          <div style={{
            width: 24, height: 24, borderRadius: '50%', background: '#fff',
            position: 'absolute', top: 3, left: theme === 'dark' ? 25 : 3,
            transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }} />
        </button>
      </div>

      <p className="muted" style={{ fontSize: 13, marginTop: 24 }}>
        More settings — like notification preferences and account management — are coming soon.
      </p>
    </div>
  )
}
