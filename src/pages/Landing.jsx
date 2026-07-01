import { supabase } from '../supabase'
import { useEffect, useState } from 'react'

export default function Landing({ goToAuth }) {
  const [stats, setStats] = useState({ verified: 0, flagged: 0, reports: 0 })

  useEffect(() => {
    async function loadStats() {
      const [v, f, r] = await Promise.all([
        supabase.from('businesses').select('id', { count: 'exact' }).eq('status', 'verified'),
        supabase.from('businesses').select('id', { count: 'exact' }).eq('status', 'flagged'),
        supabase.from('reports').select('id', { count: 'exact' }),
      ])
      setStats({
        verified: v.count || 0,
        flagged: f.count || 0,
        reports: r.count || 0,
      })
    }
    loadStats()
  }, [])

  return (
    <div className="landing">

      {/* HERO */}
      <div className="landing-hero">
        <div className="landing-badge">🇰🇪 Built for Kenyans, by Kenyans</div>
        <h1 className="landing-title">Stop online scammers<br/>before they stop you</h1>
        <p className="landing-sub">BizCheck Kenya helps you verify any seller on Facebook Marketplace, TikTok Shop, Instagram and more — before you send that M-Pesa.</p>
        <div className="landing-btns">
          <button className="landing-btn-primary" onClick={() => goToAuth('signup')}>
            Create free account →
          </button>
          <button className="landing-btn-secondary" onClick={() => goToAuth('login')}>
            Log in
          </button>
        </div>
        <p className="landing-note">Free to use · No credit card required · Trusted by Kenyans</p>
      </div>

      {/* STATS */}
      <div className="landing-stats">
        <div className="landing-stat">
          <div className="landing-stat-num">{stats.verified.toLocaleString()}</div>
          <div className="landing-stat-label">Verified businesses</div>
        </div>
        <div className="landing-stat">
          <div className="landing-stat-num">{stats.flagged.toLocaleString()}</div>
          <div className="landing-stat-label">Scammers exposed</div>
        </div>
        <div className="landing-stat">
          <div className="landing-stat-num">{stats.reports.toLocaleString()}</div>
          <div className="landing-stat-label">Community reports</div>
        </div>
        <div className="landing-stat">
          <div className="landing-stat-num">Ksh 4.2M+</div>
          <div className="landing-stat-label">Fraud prevented</div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div className="landing-section">
        <h2 className="landing-section-title">How it works</h2>
        <div className="landing-steps">
          <div className="landing-step">
            <div className="step-num">1</div>
            <h3>Search the seller</h3>
            <p>Enter their name, phone number, M-Pesa till, or social media handle.</p>
          </div>
          <div className="landing-step">
            <div className="step-num">2</div>
            <h3>Check their trust score</h3>
            <p>See their community trust score, votes, and any scam reports filed against them.</p>
          </div>
          <div className="landing-step">
            <div className="step-num">3</div>
            <h3>Buy or report</h3>
            <p>Buy with confidence from verified sellers, or report scammers to protect others.</p>
          </div>
        </div>
      </div>

      {/* PLATFORMS */}
      <div className="landing-section landing-section-green">
        <h2 className="landing-section-title" style={{ color: '#fff' }}>Works across all platforms</h2>
        <p style={{ color: '#9FE1CB', textAlign: 'center', marginBottom: 24 }}>Wherever Kenyan scammers hide, BizCheck finds them</p>
        <div className="landing-platforms">
          <div className="platform-badge">📘 Facebook Marketplace</div>
          <div className="platform-badge">🎵 TikTok Shop</div>
          <div className="platform-badge">📸 Instagram</div>
          <div className="platform-badge">💬 WhatsApp</div>
          <div className="platform-badge">🛒 Jiji</div>
          <div className="platform-badge">📱 Any platform</div>
        </div>
      </div>

      {/* WHY BIZCHECK */}
      <div className="landing-section">
        <h2 className="landing-section-title">Why BizCheck Kenya?</h2>
        <div className="landing-features">
          <div className="landing-feature">
            <div className="feature-icon">🔍</div>
            <h3>Search by anything</h3>
            <p>Name, phone number, M-Pesa till, Facebook page, TikTok handle — we search them all.</p>
          </div>
          <div className="landing-feature">
            <div className="feature-icon">👥</div>
            <h3>Community powered</h3>
            <p>Real Kenyans voting and reporting. The more people use it, the safer everyone gets.</p>
          </div>
          <div className="landing-feature">
            <div className="feature-icon">⚡</div>
            <h3>Instant results</h3>
            <p>Check a seller in seconds before sending money. Fast enough to use while chatting.</p>
          </div>
          <div className="landing-feature">
            <div className="feature-icon">🛡️</div>
            <h3>Admin verified</h3>
            <p>Our team reviews every report and submission before it goes live. No false accusations.</p>
          </div>
          <div className="landing-feature">
            <div className="feature-icon">📊</div>
            <h3>Trust scores</h3>
            <p>Every business gets a live trust score based on community votes and verified reports.</p>
          </div>
          <div className="landing-feature">
            <div className="feature-icon">🆓</div>
            <h3>100% free</h3>
            <p>Always free for Kenyans to use. No subscriptions, no paywalls, no ads.</p>
          </div>
        </div>
      </div>

      {/* CTA BOTTOM */}
      <div className="landing-cta">
        <h2>Ready to shop safely?</h2>
        <p>Join BizCheck Kenya today and never get scammed online again.</p>
        <div className="landing-btns">
          <button className="landing-btn-primary" onClick={() => goToAuth('signup')}>
            Create free account →
          </button>
          <button className="landing-btn-secondary" onClick={() => goToAuth('login')}>
            Log in
          </button>
        </div>
      </div>

      {/* FOOTER */}
      <div className="landing-footer">
        <div className="logo-footer"><span className="logo-dot"></span> BizCheck Kenya</div>
        <p>Protecting Kenyans from online fraud · 2026</p>
      </div>

    </div>
  )
}
