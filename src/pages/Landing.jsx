import { supabase } from '../supabase'
import { useEffect, useState, useRef } from 'react'
import InstallPrompt from './InstallPrompt'

// ── Demo data for the hero verification card ─────────────────────────────────
const DEMO_CASES = [
  {
    kind: 'verified',
    name: 'Wanjiku Electronics',
    handle: '@wanjiku_electronics',
    score: 94,
    votes: '212 legit votes',
  },
  {
    kind: 'flagged',
    name: 'QuickDeals254',
    handle: '@quickdeals_254',
    score: 8,
    votes: '17 scam reports',
  },
]

// ── Minimal inline icons (no external icon library) ──────────────────────────
function IconSearch(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" {...props}>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20L16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
function IconShieldCheck(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" {...props}>
      <path d="M12 3l7 3v5.2c0 4.6-3 8.4-7 9.8-4-1.4-7-5.2-7-9.8V6l7-3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 12.2l2 2 4-4.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconUsers(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" {...props}>
      <circle cx="9" cy="8.5" r="3" stroke="currentColor" strokeWidth="2" />
      <path d="M3.5 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 8.8a2.8 2.8 0 110-5.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M15 14.3c2.6.4 4.5 2.7 4.5 5.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
function IconBolt(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" {...props}>
      <path d="M13 3L5 13.5h5.5L11 21l8-10.5h-5.5L13 3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}
function IconBadge(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" {...props}>
      <circle cx="12" cy="10" r="6" stroke="currentColor" strokeWidth="2" />
      <path d="M9 9.7l1.8 1.8L15 7.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 15.5L7.5 21l4.5-2.3 4.5 2.3-1.5-5.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}
function IconOpen(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" {...props}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <path d="M8 10.5V8a4 4 0 018 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
function IconFlag(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" {...props}>
      <path d="M5 3v18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 4h11l-2.5 3.5L16 11H5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

// ── Circular trust-score ring ─────────────────────────────────────────────────
function TrustRing({ score, color }) {
  const r = 30
  const c = 2 * Math.PI * r
  const offset = c - (score / 100) * c
  return (
    <svg viewBox="0 0 72 72" width="72" height="72">
      <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="6" />
      <circle
        cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="6"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
        transform="rotate(-90 36 36)"
        style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.4,0,.2,1), stroke 500ms ease' }}
      />
      <text x="36" y="41" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="17" fontWeight="600" fill="var(--bc-ink)">
        {score}
      </text>
    </svg>
  )
}

// ── Ambient background: a slowly drifting network of trust nodes ─────────────
// Evokes the community-verification graph — businesses and reports linking up —
// rather than decorative noise. Pauses on prefers-reduced-motion and when tab
// is hidden, and stays low-opacity so hero text remains fully readable.
function TrustNetworkBackground() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let width, height, dpr
    let nodes = []
    let raf = null
    let running = true

    const NODE_COLOR = '29,158,117'   // brand green, rgb
    const LINK_DIST = 150

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.offsetWidth
      height = canvas.offsetHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const count = Math.min(46, Math.round((width * height) / 22000))
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: 1.4 + Math.random() * 1.6,
      }))
    }

    function step() {
      if (!running) return
      ctx.clearRect(0, 0, width, height)

      for (const n of nodes) {
        n.x += n.vx
        n.y += n.vy
        if (n.x < 0 || n.x > width) n.vx *= -1
        if (n.y < 0 || n.y > height) n.vy *= -1
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < LINK_DIST) {
            ctx.strokeStyle = `rgba(${NODE_COLOR},${0.10 * (1 - dist / LINK_DIST)})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      for (const n of nodes) {
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${NODE_COLOR},0.35)`
        ctx.fill()
      }

      raf = requestAnimationFrame(step)
    }

    function handleVisibility() {
      running = document.visibilityState === 'visible' && !reduceMotion
      if (running && !raf) step()
      if (!running && raf) { cancelAnimationFrame(raf); raf = null }
    }

    resize()
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', handleVisibility)

    if (reduceMotion) {
      // Draw a single static frame so the network is still visible, just not moving.
      running = true
      step()
      running = false
      if (raf) { cancelAnimationFrame(raf); raf = null }
    } else {
      step()
    }

    return () => {
      running = false
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  return <canvas ref={canvasRef} className="bc-hero-canvas" aria-hidden="true" />
}

export default function Landing({ goToAuth }) {
  const [stats, setStats] = useState({ verified: 0, flagged: 0, reports: 0 })
  const [demoIndex, setDemoIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const sectionRefs = useRef([])

  useEffect(() => {
    async function loadStats() {
      const [v, f, r] = await Promise.all([
        supabase.from('businesses').select('id', { count: 'exact', head: true }).eq('status', 'verified'),
        supabase.from('businesses').select('id', { count: 'exact', head: true }).eq('status', 'flagged'),
        supabase.from('reports').select('id', { count: 'exact', head: true }),
      ])
      setStats({ verified: v.count || 0, flagged: f.count || 0, reports: r.count || 0 })
    }
    loadStats()
  }, [])

  // Cycle the hero demo card between a verified and a flagged example
  useEffect(() => {
    setRevealed(false)
    const revealTimer = setTimeout(() => setRevealed(true), 550)
    const nextTimer = setInterval(() => {
      setRevealed(false)
      setTimeout(() => {
        setDemoIndex((i) => (i + 1) % DEMO_CASES.length)
      }, 350)
    }, 4800)
    return () => { clearTimeout(revealTimer); clearInterval(nextTimer) }
  }, [demoIndex === 0])

  // Scroll-reveal for sections
  useEffect(() => {
    const els = sectionRefs.current.filter(Boolean)
    if (!('IntersectionObserver' in window) || els.length === 0) {
      els.forEach((el) => el.classList.add('bc-in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('bc-in')
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.14 }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  const demo = DEMO_CASES[demoIndex]
  const isFlagged = demo.kind === 'flagged'
  const ringColor = isFlagged ? '#C7433F' : '#1D9E75'

  const registerSection = (i) => (el) => { sectionRefs.current[i] = el }

  return (
    <div className="bc-land">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap');

        .bc-land {
          --bc-ink: #0C1613;
          --bc-paper: #F6F8F7;
          --bc-surface: #FFFFFF;
          --bc-brand: #1D9E75;
          --bc-brand-dark: #0E6B52;
          --bc-brand-deep: #0A4C3B;
          --bc-brand-tint: #E9F7F1;
          --bc-danger: #C7433F;
          --bc-danger-tint: #FBEBEA;
          --bc-border: #E1E8E5;
          --bc-muted: #5C6D67;
          --bc-mono: 'IBM Plex Mono', ui-monospace, monospace;
          --bc-display: 'Space Grotesk', ui-sans-serif, sans-serif;
          --bc-body: 'Manrope', ui-sans-serif, sans-serif;

          font-family: var(--bc-body);
          color: var(--bc-ink);
          background: var(--bc-paper);
          -webkit-font-smoothing: antialiased;
          overflow-x: hidden;
        }
        .bc-land * { box-sizing: border-box; }
        .bc-land h1, .bc-land h2, .bc-land h3 {
          font-family: var(--bc-display);
          letter-spacing: -0.02em;
          margin: 0;
        }
        .bc-land p { margin: 0; line-height: 1.6; }
        .bc-container { max-width: 1080px; margin: 0 auto; padding: 0 24px; }

        /* ── Reveal-on-scroll ────────────────────────────────────────────── */
        .bc-reveal { opacity: 0; transform: translateY(18px); transition: opacity 700ms ease, transform 700ms cubic-bezier(.16,1,.3,1); }
        .bc-reveal.bc-in { opacity: 1; transform: translateY(0); }
        @media (prefers-reduced-motion: reduce) {
          .bc-reveal { opacity: 1; transform: none; transition: none; }
        }

        /* ── Nav ─────────────────────────────────────────────────────────── */
        .bc-nav {
          position: sticky; top: 0; z-index: 40;
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 24px;
          background: rgba(246,248,247,0.82);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--bc-border);
        }
        .bc-logo { display: flex; align-items: center; gap: 9px; }
        .bc-logo-mark {
          width: 32px; height: 32px; border-radius: 9px;
          background: var(--bc-brand);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .bc-logo-word { font-family: var(--bc-display); font-weight: 700; font-size: 16.5px; letter-spacing: -0.01em; }
        .bc-nav-actions { display: flex; align-items: center; gap: 18px; }
        .bc-link { font-size: 14px; font-weight: 600; color: var(--bc-ink); text-decoration: none; background: none; border: none; cursor: pointer; }
        .bc-btn {
          font-family: var(--bc-body); font-weight: 700; font-size: 14px;
          border-radius: 10px; border: none; cursor: pointer;
          padding: 10px 18px;
          transition: transform 150ms ease, box-shadow 150ms ease, background 150ms ease;
        }
        .bc-btn:active { transform: scale(0.97); }
        .bc-btn-primary { background: var(--bc-brand); color: #fff; box-shadow: 0 1px 2px rgba(10,76,59,0.15); }
        .bc-btn-primary:hover { background: var(--bc-brand-dark); }
        .bc-btn-ghost { background: transparent; color: var(--bc-ink); border: 1.5px solid var(--bc-border); }
        .bc-btn-ghost:hover { border-color: var(--bc-brand); color: var(--bc-brand-dark); }
        .bc-btn-lg { padding: 14px 26px; font-size: 15px; border-radius: 12px; }

        /* ── Hero ────────────────────────────────────────────────────────── */
        .bc-hero { padding: 64px 24px 20px; text-align: center; position: relative; overflow: hidden; }
        .bc-hero-canvas {
          position: absolute; inset: 0; width: 100%; height: 100%;
          z-index: 0; pointer-events: none;
          mask-image: radial-gradient(ellipse 70% 60% at 50% 30%, #000 40%, transparent 85%);
          -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 30%, #000 40%, transparent 85%);
        }
        .bc-hero > .bc-container { position: relative; z-index: 1; }
        .bc-eyebrow {
          display: inline-flex; align-items: center; gap: 7px;
          font-family: var(--bc-mono); font-size: 12px; font-weight: 500;
          color: var(--bc-brand-deep); background: var(--bc-brand-tint);
          border: 1px solid #CFEDE0;
          padding: 6px 13px; border-radius: 99px; margin-bottom: 22px;
        }
        .bc-eyebrow-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--bc-brand); }
        .bc-hero h1 {
          font-size: clamp(34px, 6vw, 58px);
          font-weight: 700; line-height: 1.06;
          max-width: 780px; margin: 0 auto;
        }
        .bc-hero h1 em { font-style: normal; color: var(--bc-brand-dark); }
        .bc-hero-sub {
          max-width: 540px; margin: 22px auto 0;
          font-size: 17px; color: var(--bc-muted);
        }
        .bc-hero-btns { display: flex; gap: 12px; justify-content: center; margin: 30px 0 12px; flex-wrap: wrap; }
        .bc-hero-note { font-size: 13px; color: var(--bc-muted); font-family: var(--bc-mono); }

        /* ── Demo verification card ─────────────────────────────────────── */
        .bc-demo-wrap { max-width: 400px; margin: 48px auto 0; position: relative; }
        .bc-demo-card {
          position: relative; background: var(--bc-surface);
          border: 1px solid var(--bc-border); border-radius: 18px;
          padding: 22px; text-align: left;
          box-shadow: 0 24px 48px -20px rgba(10,30,24,0.18);
        }
        .bc-demo-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .bc-demo-search {
          display: flex; align-items: center; gap: 8px;
          font-family: var(--bc-mono); font-size: 12.5px; color: var(--bc-muted);
        }
        .bc-demo-live { display: flex; align-items: center; gap: 6px; font-family: var(--bc-mono); font-size: 10.5px; color: var(--bc-brand-dark); font-weight: 600; }
        .bc-demo-live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--bc-brand); animation: bcPulse 1.6s ease-in-out infinite; }
        @keyframes bcPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

        .bc-demo-body {
          display: flex; align-items: center; gap: 16px;
          opacity: 0; transform: translateY(6px);
          transition: opacity 420ms ease, transform 420ms ease;
        }
        .bc-demo-body.bc-show { opacity: 1; transform: translateY(0); }
        .bc-demo-info { flex: 1; min-width: 0; }
        .bc-demo-name { font-family: var(--bc-display); font-weight: 700; font-size: 16px; margin-bottom: 2px; }
        .bc-demo-handle { font-family: var(--bc-mono); font-size: 12px; color: var(--bc-muted); margin-bottom: 10px; }
        .bc-demo-tag {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11.5px; font-weight: 700; padding: 4px 9px; border-radius: 99px;
        }
        .bc-demo-tag.ok { background: var(--bc-brand-tint); color: var(--bc-brand-deep); }
        .bc-demo-tag.bad { background: var(--bc-danger-tint); color: var(--bc-danger); }
        .bc-demo-votes { font-size: 12px; color: var(--bc-muted); margin-top: 6px; }

        /* ── Stats strip ─────────────────────────────────────────────────── */
        .bc-stats {
          background: var(--bc-brand-deep);
          background-image: radial-gradient(circle at 15% 20%, rgba(29,158,117,0.35), transparent 45%);
          padding: 40px 24px;
          margin-top: 64px;
        }
        .bc-stats-grid {
          max-width: 1080px; margin: 0 auto;
          display: grid; grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }
        .bc-stat { text-align: center; padding: 6px 10px; border-right: 1px solid rgba(255,255,255,0.12); }
        .bc-stat:last-child { border-right: none; }
        .bc-stat-num { font-family: var(--bc-mono); font-size: clamp(20px, 3.4vw, 30px); font-weight: 600; color: #fff; }
        .bc-stat-label { font-size: 12px; color: rgba(255,255,255,0.68); margin-top: 4px; }
        @media (max-width: 640px) {
          .bc-stats-grid { grid-template-columns: repeat(2, 1fr); row-gap: 22px; }
          .bc-stat:nth-child(2) { border-right: none; }
        }

        /* ── Generic section ─────────────────────────────────────────────── */
        .bc-section { padding: 76px 24px; }
        .bc-section-head { text-align: center; max-width: 560px; margin: 0 auto 44px; }
        .bc-section-eyebrow { font-family: var(--bc-mono); font-size: 12px; color: var(--bc-brand-dark); font-weight: 600; margin-bottom: 10px; letter-spacing: 0.02em; }
        .bc-section h2 { font-size: clamp(26px, 3.6vw, 34px); }
        .bc-section-sub { color: var(--bc-muted); margin-top: 10px; font-size: 15px; }

        /* ── Steps ───────────────────────────────────────────────────────── */
        .bc-steps { max-width: 1080px; margin: 0 auto; display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; position: relative; }
        .bc-step { padding: 0 22px; position: relative; }
        .bc-step::before {
          content: ''; position: absolute; top: 21px; left: -22px; right: calc(100% - 22px + 22px);
          height: 1px; background: var(--bc-border);
        }
        .bc-step:first-child::before { display: none; }
        .bc-step-num {
          font-family: var(--bc-mono); font-size: 13px; font-weight: 600;
          color: var(--bc-brand-dark); background: var(--bc-brand-tint);
          width: 42px; height: 42px; border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 18px;
        }
        .bc-step h3 { font-size: 17px; margin-bottom: 8px; }
        .bc-step p { font-size: 14px; color: var(--bc-muted); }
        @media (max-width: 800px) {
          .bc-steps { grid-template-columns: 1fr; gap: 30px; }
          .bc-step::before { display: none; }
        }

        /* ── Platforms ───────────────────────────────────────────────────── */
        .bc-platforms {
          display: flex; flex-wrap: wrap; gap: 10px; justify-content: center;
          max-width: 720px; margin: 0 auto;
        }
        .bc-chip {
          font-family: var(--bc-mono); font-size: 13px; font-weight: 500;
          border: 1px solid var(--bc-border); background: var(--bc-surface);
          padding: 9px 16px; border-radius: 99px; color: var(--bc-ink);
          display: flex; align-items: center; gap: 8px;
        }
        .bc-chip-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--bc-brand); }

        /* ── Features grid ───────────────────────────────────────────────── */
        .bc-features { max-width: 1080px; margin: 0 auto; display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--bc-border); border: 1px solid var(--bc-border); border-radius: 16px; overflow: hidden; }
        .bc-feature { background: var(--bc-surface); padding: 30px 26px; }
        .bc-feature-icon {
          width: 42px; height: 42px; border-radius: 11px;
          background: var(--bc-brand-tint); color: var(--bc-brand-deep);
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 16px;
        }
        .bc-feature h3 { font-size: 15.5px; margin-bottom: 6px; }
        .bc-feature p { font-size: 13.5px; color: var(--bc-muted); }
        @media (max-width: 800px) { .bc-features { grid-template-columns: 1fr; } }

        /* ── CTA band ────────────────────────────────────────────────────── */
        .bc-cta {
          margin: 0 24px 24px; padding: 56px 32px; text-align: center;
          background: var(--bc-brand-deep);
          background-image: radial-gradient(circle at 85% 15%, rgba(29,158,117,0.4), transparent 50%);
          border-radius: 24px; color: #fff;
        }
        .bc-cta h2 { color: #fff; font-size: clamp(24px, 3.6vw, 32px); }
        .bc-cta p { color: rgba(255,255,255,0.72); margin-top: 10px; font-size: 15px; }
        .bc-cta .bc-hero-btns { margin-top: 26px; margin-bottom: 0; }
        .bc-cta .bc-btn-ghost { border-color: rgba(255,255,255,0.35); color: #fff; }
        .bc-cta .bc-btn-ghost:hover { border-color: #fff; }

        /* ── Footer ──────────────────────────────────────────────────────── */
        .bc-footer { padding: 40px 24px 30px; text-align: center; }
        .bc-footer .bc-logo { justify-content: center; margin-bottom: 10px; }
        .bc-footer-note { font-size: 13px; color: var(--bc-muted); }
      `}</style>

      {/* NAV */}
      <div className="bc-nav">
        <div className="bc-logo">
          <div className="bc-logo-mark">
            <IconShieldCheck color="#fff" width="18" height="18" />
          </div>
          <span className="bc-logo-word">BizCheck Kenya</span>
        </div>
        <div className="bc-nav-actions">
          <button className="bc-link" onClick={() => goToAuth('login')}>Log in</button>
          <button className="bc-btn bc-btn-primary" onClick={() => goToAuth('signup')}>Get started</button>
        </div>
      </div>

      {/* HERO */}
      <div className="bc-hero">
        <TrustNetworkBackground />
        <div className="bc-container">
          <div className="bc-eyebrow">
            <span className="bc-eyebrow-dot" />
            Built for Kenyans, by Kenyans
          </div>
          <h1>Know who you're paying,<br /><em>before you pay them.</em></h1>
          <p className="bc-hero-sub">
            BizCheck Kenya verifies sellers on Facebook Marketplace, TikTok Shop, Instagram
            and WhatsApp — so you can check a trust score before you send that M-Pesa.
          </p>
          <div className="bc-hero-btns">
            <button className="bc-btn bc-btn-primary bc-btn-lg" onClick={() => goToAuth('signup')}>
              Create free account
            </button>
            <button className="bc-btn bc-btn-ghost bc-btn-lg" onClick={() => goToAuth('login')}>
              Log in
            </button>
          </div>
          <p className="bc-hero-note">FREE TO USE · NO CARD REQUIRED</p>

          <div style={{ maxWidth: 280, margin: '18px auto 0' }}>
            <InstallPrompt />
          </div>

          {/* Signature: live verification demo */}
          <div className="bc-demo-wrap">
            <div className="bc-demo-card">
              <div className="bc-demo-top">
                <div className="bc-demo-search">
                  <IconSearch color="var(--bc-muted)" width="15" height="15" />
                  searching {demo.handle}
                </div>
                <div className="bc-demo-live">
                  <span className="bc-demo-live-dot" />
                  LIVE EXAMPLE
                </div>
              </div>
              <div className={`bc-demo-body ${revealed ? 'bc-show' : ''}`}>
                <TrustRing score={demo.score} color={ringColor} />
                <div className="bc-demo-info">
                  <div className="bc-demo-name">{demo.name}</div>
                  <div className="bc-demo-handle">{demo.handle}</div>
                  {isFlagged ? (
                    <span className="bc-demo-tag bad"><IconFlag /> Flagged</span>
                  ) : (
                    <span className="bc-demo-tag ok">✓ Verified</span>
                  )}
                  <div className="bc-demo-votes">{demo.votes}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* STATS */}
      <div className="bc-stats bc-reveal" ref={registerSection(0)}>
        <div className="bc-stats-grid">
          <div className="bc-stat">
            <div className="bc-stat-num">{stats.verified.toLocaleString()}</div>
            <div className="bc-stat-label">Verified businesses</div>
          </div>
          <div className="bc-stat">
            <div className="bc-stat-num">{stats.flagged.toLocaleString()}</div>
            <div className="bc-stat-label">Scammers exposed</div>
          </div>
          <div className="bc-stat">
            <div className="bc-stat-num">{stats.reports.toLocaleString()}</div>
            <div className="bc-stat-label">Community reports</div>
          </div>
          <div className="bc-stat">
            <div className="bc-stat-num">100%</div>
            <div className="bc-stat-label">Free to use</div>
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div className="bc-section bc-reveal" ref={registerSection(1)}>
        <div className="bc-section-head">
          <div className="bc-section-eyebrow">THE PROCESS</div>
          <h2>Three steps, before you send a shilling</h2>
        </div>
        <div className="bc-steps">
          <div className="bc-step">
            <div className="bc-step-num">01</div>
            <h3>Search the seller</h3>
            <p>Enter their name, phone number, M-Pesa till, or social media handle.</p>
          </div>
          <div className="bc-step">
            <div className="bc-step-num">02</div>
            <h3>Check their trust score</h3>
            <p>See their community trust score, votes, and any scam reports filed against them.</p>
          </div>
          <div className="bc-step">
            <div className="bc-step-num">03</div>
            <h3>Buy or report</h3>
            <p>Buy with confidence from verified sellers, or report scammers to protect others.</p>
          </div>
        </div>
      </div>

      {/* PLATFORMS */}
      <div className="bc-section bc-reveal" style={{ paddingTop: 0 }} ref={registerSection(2)}>
        <div className="bc-section-head">
          <div className="bc-section-eyebrow">COVERAGE</div>
          <h2>Wherever sellers hide, we check</h2>
          <p className="bc-section-sub">One search across every platform Kenyans buy and sell on.</p>
        </div>
        <div className="bc-platforms">
          {['Facebook Marketplace', 'TikTok Shop', 'Instagram', 'WhatsApp', 'Jiji', 'Any platform'].map((p) => (
            <div className="bc-chip" key={p}><span className="bc-chip-dot" />{p}</div>
          ))}
        </div>
      </div>

      {/* WHY BIZCHECK */}
      <div className="bc-section bc-reveal" ref={registerSection(3)}>
        <div className="bc-section-head">
          <div className="bc-section-eyebrow">WHY BIZCHECK</div>
          <h2>Built to be trusted, not just used</h2>
        </div>
        <div className="bc-features">
          <div className="bc-feature">
            <div className="bc-feature-icon"><IconSearch /></div>
            <h3>Search by anything</h3>
            <p>Name, phone, M-Pesa till, Facebook page, TikTok handle — we search them all.</p>
          </div>
          <div className="bc-feature">
            <div className="bc-feature-icon"><IconUsers /></div>
            <h3>Community powered</h3>
            <p>Real Kenyans voting and reporting. The more people use it, the safer everyone gets.</p>
          </div>
          <div className="bc-feature">
            <div className="bc-feature-icon"><IconBolt /></div>
            <h3>Instant results</h3>
            <p>Check a seller in seconds — fast enough to use while you're still chatting.</p>
          </div>
          <div className="bc-feature">
            <div className="bc-feature-icon"><IconBadge /></div>
            <h3>Reviewed submissions</h3>
            <p>Every business listing is checked before it goes live. No false accusations.</p>
          </div>
          <div className="bc-feature">
            <div className="bc-feature-icon"><IconShieldCheck /></div>
            <h3>Live trust scores</h3>
            <p>Every business gets a score that updates with real community activity.</p>
          </div>
          <div className="bc-feature">
            <div className="bc-feature-icon"><IconOpen /></div>
            <h3>Always free</h3>
            <p>Free for Kenyans to search, verify, and report. No subscriptions, no paywalls.</p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bc-cta bc-reveal" ref={registerSection(4)}>
        <h2>Ready to shop safely?</h2>
        <p>Join BizCheck Kenya today and check before you send.</p>
        <div className="bc-hero-btns">
          <button className="bc-btn bc-btn-primary bc-btn-lg" onClick={() => goToAuth('signup')}>
            Create free account
          </button>
          <button className="bc-btn bc-btn-ghost bc-btn-lg" onClick={() => goToAuth('login')}>
            Log in
          </button>
        </div>
      </div>

      {/* FOOTER */}
      <div className="bc-footer">
        <div className="bc-logo">
          <div className="bc-logo-mark">
            <IconShieldCheck color="#fff" width="16" height="16" />
          </div>
          <span className="bc-logo-word">BizCheck Kenya</span>
        </div>
        <p className="bc-footer-note">Protecting Kenyans from online fraud · 2026</p>
      </div>
    </div>
  )
}
