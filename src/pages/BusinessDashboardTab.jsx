import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import RubiksLoader from './RubiksLoader'

const GREEN = '#1D9E75'
const GREEN_DARK = '#0F6E56'
const DAYS = 30

export default function BusinessDashboardTab({ business }) {
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [sources, setSources] = useState({ profile: 0, card: 0, scan: 0 })

  useEffect(() => { load() }, [business?.id])

  async function load() {
    if (!business?.id) return
    setLoading(true)

    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString()

    const [
      { data: profileViews },
      { data: scans },
      { data: postViews },
      { count: reviewCount },
      { data: posts },
    ] = await Promise.all([
      supabase.from('profile_views').select('view_type, created_at').eq('business_id', business.id),
      supabase.from('qr_scans').select('scanned_at').eq('business_id', business.id),
      supabase.from('post_views').select('created_at').eq('business_id', business.id).gte('created_at', since),
      supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('business_id', business.id),
      supabase.from('market_posts').select('id').eq('business_id', business.id).eq('status', 'approved'),
    ])

    const pv = profileViews || []
    const sc = scans || []

    const bySource = {
      profile: pv.filter((v) => v.view_type === 'profile_view').length,
      card: pv.filter((v) => v.view_type === 'card_click').length,
      scan: sc.length,
    }
    setSources(bySource)

    // Build a per-day series over the last 30 days
    const dayBuckets = {}
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      dayBuckets[d.toISOString().slice(0, 10)] = 0
    }
    const bump = (isoDate) => {
      const key = (isoDate || '').slice(0, 10)
      if (key in dayBuckets) dayBuckets[key] += 1
    }
    pv.forEach((v) => bump(v.created_at))
    sc.forEach((s) => bump(s.scanned_at))
    ;(postViews || []).forEach((v) => bump(v.created_at))

    setTimeline(Object.entries(dayBuckets).map(([date, count]) => ({ date, count })))

    setMetrics({
      totalViews: business.view_count ?? pv.length,
      storeVisits: bySource.profile + bySource.card + bySource.scan,
      reviewCount: reviewCount ?? business.review_count ?? 0,
      avgRating: business.avg_rating ?? 0,
      trustScore: business.trust_score ?? 0,
      livePosts: (posts || []).length,
      legitVotes: business.legit_votes ?? 0,
      scamVotes: business.scam_votes ?? 0,
      productViews: (postViews || []).length,
    })

    setLoading(false)
  }

  if (loading) return <RubiksLoader label="Crunching your numbers…" />
  if (!metrics) return <p className="muted">No data yet.</p>

  return (
    <div style={{ textAlign: 'left' }}>
      <h3 style={{ marginBottom: 2 }}>Performance</h3>
      <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>How your business is doing on BizCheck.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 22 }}>
        <Stat label="Total views" value={metrics.totalViews} />
        <Stat label="Store visits" value={metrics.storeVisits} accent />
        <Stat label="Product views" value={metrics.productViews} />
        <Stat label="Reviews" value={metrics.reviewCount} />
        <Stat label="Avg rating" value={metrics.avgRating > 0 ? metrics.avgRating.toFixed(1) : '—'} />
        <Stat label="Trust score" value={`${metrics.trustScore}%`} accent />
        <Stat label="Live posts" value={metrics.livePosts} />
        <Stat label="Legit votes" value={metrics.legitVotes} />
      </div>

      <Card title="Activity over the last 30 days" subtitle="Profile views, card clicks, QR scans and product views combined">
        <LineChart data={timeline} />
      </Card>

      <Card title="Where your visits come from">
        <SourceBars sources={sources} />
      </Card>

      <Card title="Community sentiment">
        <SentimentBar legit={metrics.legitVotes} scam={metrics.scamVotes} />
      </Card>
    </div>
  )
}

function Stat({ label, value, accent }) {
  return (
    <div style={{
      background: accent ? '#EAF8F3' : 'var(--surface)',
      border: `1px solid ${accent ? '#BEE9DA' : 'var(--border)'}`,
      borderRadius: 12, padding: '14px 12px', textAlign: 'left',
    }}>
      <div style={{ fontSize: 21, fontWeight: 800, color: accent ? GREEN_DARK : 'var(--text-strong)' }}>{value}</div>
      <div className="muted" style={{ fontSize: 11.5 }}>{label}</div>
    </div>
  )
}

function Card({ title, subtitle, children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 16 }}>
      <p style={{ fontWeight: 700, fontSize: 14, marginBottom: subtitle ? 2 : 12 }}>{title}</p>
      {subtitle && <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>{subtitle}</p>}
      {children}
    </div>
  )
}

function LineChart({ data }) {
  if (!data || data.length === 0) return <p className="muted" style={{ fontSize: 13 }}>No activity yet.</p>

  const width = 320
  const height = 110
  const padding = 6
  const max = Math.max(1, ...data.map((d) => d.count))
  const stepX = (width - padding * 2) / Math.max(1, data.length - 1)

  const points = data.map((d, i) => {
    const x = padding + i * stepX
    const y = height - padding - (d.count / max) * (height - padding * 2)
    return `${x},${y}`
  })

  const areaPath = `M${padding},${height - padding} L${points.join(' L')} L${padding + (data.length - 1) * stepX},${height - padding} Z`
  const total = data.reduce((sum, d) => sum + d.count, 0)

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="Activity over the last 30 days">
        <path d={areaPath} fill={GREEN} opacity="0.12" />
        <polyline points={points.join(' ')} fill="none" stroke={GREEN} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }} className="muted">
        <span>{data[0]?.date.slice(5)}</span>
        <span>{total} interactions</span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  )
}

function SourceBars({ sources }) {
  const rows = [
    { label: 'Profile views', value: sources.profile },
    { label: 'Card clicks', value: sources.card },
    { label: 'QR scans', value: sources.scan },
  ]
  const max = Math.max(1, ...rows.map((r) => r.value))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map((r) => (
        <div key={r.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
            <span>{r.label}</span>
            <span style={{ fontWeight: 700 }}>{r.value}</span>
          </div>
          <div style={{ height: 8, background: 'var(--hover-bg)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: `${(r.value / max) * 100}%`, height: '100%', background: GREEN, borderRadius: 999 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function SentimentBar({ legit, scam }) {
  const total = legit + scam
  if (total === 0) return <p className="muted" style={{ fontSize: 13 }}>No community votes yet.</p>
  const legitPct = Math.round((legit / total) * 100)

  return (
    <div>
      <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ width: `${legitPct}%`, background: GREEN }} />
        <div style={{ width: `${100 - legitPct}%`, background: '#E24B4A' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
        <span style={{ color: GREEN_DARK, fontWeight: 600 }}>👍 {legit} legit ({legitPct}%)</span>
        <span style={{ color: '#C0392B', fontWeight: 600 }}>👎 {scam} scam</span>
      </div>
    </div>
  )
}
