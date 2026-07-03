export default function Support({ onBack }) {
  return (
    <div className="section" style={{ maxWidth: 560 }}>
      <button className="link-btn" onClick={onBack}>← Back</button>
      <h2 style={{ marginBottom: 6 }}>Support</h2>
      <p className="muted" style={{ marginBottom: 24 }}>Need help? We're here for you.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--hover-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>✉️</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-strong)' }}>Email us</div>
            <div className="muted" style={{ fontSize: 13 }}>support@bizcheckkenya.com</div>
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--hover-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📞</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-strong)' }}>Call or WhatsApp</div>
            <div className="muted" style={{ fontSize: 13 }}>0700 000 000</div>
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--hover-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>⏱️</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-strong)' }}>Response time</div>
            <div className="muted" style={{ fontSize: 13 }}>We usually reply within 24 hours</div>
          </div>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 13, marginTop: 24 }}>
        FAQs and a full contact form are coming soon.
      </p>
    </div>
  )
}
