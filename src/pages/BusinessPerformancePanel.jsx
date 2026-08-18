import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { rpc } from '../supabaseHelpers'
import { formatChecks, formatKsh, checksToKsh } from './checksUtils'
import { SkeletonList } from './Skeleton'

// ─── Subscription status display config ──────────────────────────────────────
const SUB_STATUS_CONFIG = {
  unlisted:    { label: 'Unlisted',     color: '#6B7280', bg: 'var(--surface-2)' },
  approved:    { label: 'Approved',     color: '#0D6E82', bg: '#E0F7EF' },
  fee_pending: { label: 'Fee pending',  color: '#854D0E', bg: '#FEF3C7' },
  trial:       { label: 'Trial',        color: '#1D9E75', bg: '#D1FAE5' },
  active:      { label: 'Active',       color: '#1D9E75', bg: '#D1FAE5' },
  suspended:   { label: 'Suspended',    color: '#A32D2D', bg: '#FCEBEB' },
  rejected:    { label: 'Rejected',     color: '#A32D2D', bg: '#FCEBEB' },
}

const SUB_STATUS_OPTIONS = [
  'unlisted', 'approved', 'fee_pending', 'trial', 'active', 'suspended', 'rejected',
]

const EVENT_LABELS = {
  created:        'Created',
  approved:       'Approved',
  fee_paid:       'Listing fee paid',
  trial_started:  'Trial started',
  renewed:        'Subscription renewed',
  suspended:      'Suspended',
  reactivated:    'Reactivated',
  admin_override: 'Admin override',
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, primary, secondary, accent }) {
  return (
    <div style={{
      background: accent ? '#E0F7EF' : 'var(--surface-2)',
      borderRadius: 10,
      padding: '12px 14px',
      minWidth: 0,
    }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: accent ? '#0D6E82' : 'var(--text)' }}>
        {primary}
      </div>
      {secondary && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{secondary}</div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

// ─── Auto-review score display ────────────────────────────────────────────────
function AutoReviewScore({ score, issues }) {
  const passed = score ?? 0
  const total = 5
  const allClear = passed === total && (!issues || issues.length === 0)

  return (
    <div style={{
      background: allClear ? '#D1FAE5' : passed >= 3 ? '#FEF3C7' : '#FCEBEB',
      borderRadius: 10,
      padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: issues?.length ? 8 : 0 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: allClear ? '#1D9E75' : passed >= 3 ? '#854D0E' : '#A32D2D' }}>
          Auto-review: {passed}/{total}
        </span>
        <span style={{ fontSize: 13 }}>
          {allClear ? '✓ All checks passed' : `${total - passed} issue${total - passed !== 1 ? 's' : ''} flagged`}
        </span>
      </div>
      {issues && issues.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#A32D2D', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {issues.map((issue, i) => <li key={i}>{issue}</li>)}
        </ul>
      )}
    </div>
  )
}

// ─── Subscription override modal ──────────────────────────────────────────────
function OverrideModal({ businessId, currentStatus, onClose, onSuccess }) {
  const [newStatus, setNewStatus] = useState(currentStatus)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit() {
    if (newStatus === currentStatus) { onClose(); return }
    if (!note.trim()) { setError('Please add a note explaining why.'); return }
    setSaving(true)
    setError(null)
    try {
      await rpc('admin_override_business_subscription', {
        p_business_id: businessId,
        p_new_status: newStatus,
        p_note: note.trim(),
      })
      onSuccess(newStatus)
    } catch (err) {
      setError(err.message || 'Failed to update subscription status.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 16, padding: 28,
        maxWidth: 400, width: '100%', border: '1px solid var(--border)',
      }}>
        <h3 style={{ margin: '0 0 6px', color: 'var(--text)' }}>Override subscription status</h3>
        <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
          This is recorded in the subscription event log.
        </p>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            New status
          </label>
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10,
              border: '1px solid var(--border)', fontSize: 14,
              background: 'var(--surface-2)', color: 'var(--text)',
            }}
          >
            {SUB_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{SUB_STATUS_CONFIG[s]?.label ?? s}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Reason <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(required — saved to event log)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="e.g. Owner requested suspension while travelling"
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10,
              border: '1px solid var(--border)', fontSize: 13,
              background: 'var(--surface-2)', color: 'var(--text)',
              boxSizing: 'border-box', resize: 'vertical',
            }}
          />
        </div>

        {error && (
          <p style={{ color: '#A32D2D', fontSize: 13, marginBottom: 12, fontWeight: 600 }}>✗ {error}</p>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              flex: 1, padding: '11px 0', background: saving ? 'var(--border)' : '#1D9E75',
              color: '#fff', border: 'none', borderRadius: 10,
              fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Apply override'}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '11px 20px', background: 'var(--surface-2)',
              border: '1px solid var(--border)', borderRadius: 10,
              fontSize: 14, cursor: 'pointer', color: 'var(--text)',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
/**
 * BusinessPerformancePanel
 *
 * Props:
 *   business     – the minimal business object already in AdminDashboard state
 *                  (id, name, status, owner_id etc.) — used for immediate render
 *   currentAdminId – from AdminDashboard state
 *   onClose      – called when the panel is dismissed
 *   onRefresh    – called after a status change so AdminDashboard reloads its list
 */
export default function BusinessPerformancePanel({ business, currentAdminId, onClose, onRefresh }) {
  const [detail, setDetail]           = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [showOverride, setShowOverride] = useState(false)
  const [autoReviewing, setAutoReviewing] = useState(false)
  const [actionMsg, setActionMsg]     = useState(null)

  useEffect(() => {
    loadDetail()
  }, [business.id])

  async function loadDetail() {
    setLoading(true)
    setError(null)
    try {
      const data = await rpc('get_business_admin_detail', { p_business_id: business.id })
      setDetail(data)
    } catch (err) {
      setError(err.message || 'Failed to load business detail.')
    } finally {
      setLoading(false)
    }
  }

  async function runAutoReview() {
    setAutoReviewing(true)
    setActionMsg(null)
    try {
      await rpc('auto_review_business', { p_business_id: business.id })
      setActionMsg({ ok: true, text: 'Auto-review complete.' })
      await loadDetail()
      onRefresh?.()
    } catch (err) {
      setActionMsg({ ok: false, text: err.message || 'Auto-review failed.' })
    } finally {
      setAutoReviewing(false)
    }
  }

  async function handleManualStatus(newStatus) {
    try {
      const { error } = await supabase.rpc('admin_set_business_status', {
        p_business_id: business.id,
        p_status: newStatus,
        p_admin_id: currentAdminId,
      })
      if (error) throw error
      setActionMsg({ ok: true, text: `Business marked as ${newStatus}.` })
      await loadDetail()
      onRefresh?.()
    } catch (err) {
      setActionMsg({ ok: false, text: err.message || 'Failed to update status.' })
    }
  }

  function handleOverrideSuccess(newStatus) {
    setShowOverride(false)
    setActionMsg({ ok: true, text: `Subscription status set to ${newStatus}.` })
    loadDetail()
    onRefresh?.()
  }

  // ── Derived display values ─────────────────────────────────────────────────
  const subCfg = SUB_STATUS_CONFIG[detail?.subscription_status] ?? { label: detail?.subscription_status, color: '#6B7280', bg: 'var(--surface-2)' }

  const daysLabel = (() => {
    if (!detail) return null
    const d = detail.days_remaining
    if (d === null || d === undefined) return null
    if (detail.subscription_status === 'trial') return `${d} day${d !== 1 ? 's' : ''} left in trial`
    if (detail.subscription_status === 'active') return `${d} day${d !== 1 ? 's' : ''} until renewal`
    return null
  })()

  const totalRevenue = detail
    ? (Number(detail.revenue_checks) + Number(detail.subscription_revenue_checks))
    : 0

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
      }} onClick={onClose} />

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: '100%', maxWidth: 560,
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        zIndex: 201, overflowY: 'auto', padding: '28px 24px',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, color: 'var(--text)' }}>{business.name}</h2>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              {business.category}
              {detail?.owner_email && (
                <span> · <a href={`mailto:${detail.owner_email}`} style={{ color: '#1D9E75' }}>{detail.owner_email}</a></span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
              fontSize: 13, color: 'var(--text)', flexShrink: 0,
            }}
          >
            ✕ Close
          </button>
        </div>

        {/* ── Action message ── */}
        {actionMsg && (
          <div style={{
            background: actionMsg.ok ? '#D1FAE5' : '#FCEBEB',
            color: actionMsg.ok ? '#1D9E75' : '#A32D2D',
            borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600,
          }}>
            {actionMsg.ok ? '✓ ' : '✗ '}{actionMsg.text}
          </div>
        )}

        {loading && <SkeletonList count={5} />}
        {error && <p style={{ color: '#A32D2D', fontSize: 14 }}>Error: {error}</p>}

        {!loading && !error && detail && (
          <>
            {/* ── Subscription status ── */}
            <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 10, textTransform: 'uppercase' }}>
                Subscription
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{
                  display: 'inline-block', padding: '4px 12px',
                  borderRadius: 20, fontSize: 13, fontWeight: 700,
                  color: subCfg.color, background: subCfg.bg,
                }}>
                  {subCfg.label}
                </span>
                {daysLabel && (
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{daysLabel}</span>
                )}
                {detail.auto_renew === false && detail.subscription_status === 'active' && (
                  <span style={{ fontSize: 12, color: '#854D0E', background: '#FEF3C7', padding: '2px 8px', borderRadius: 10 }}>
                    Auto-renew off
                  </span>
                )}
              </div>
              {detail.listing_fee_paid && detail.listing_fee_paid_at && (
                <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  Listing fee paid {new Date(detail.listing_fee_paid_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              )}
              <button
                onClick={() => setShowOverride(true)}
                style={{
                  marginTop: 12, padding: '7px 14px', fontSize: 12, fontWeight: 600,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 8, cursor: 'pointer', color: 'var(--text)',
                }}
              >
                Override subscription status
              </button>
            </div>

            {/* ── Revenue & GMV stats ── */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 10, textTransform: 'uppercase' }}>
                Revenue & activity
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
                <StatCard
                  label="Platform revenue"
                  primary={formatChecks(totalRevenue)}
                  secondary={formatKsh(checksToKsh(totalRevenue))}
                  accent
                />
                <StatCard
                  label="Total GMV"
                  primary={formatChecks(detail.gmv_checks)}
                  secondary={formatKsh(checksToKsh(detail.gmv_checks))}
                />
                <StatCard
                  label="Orders completed"
                  primary={detail.order_count_completed}
                  secondary={`${detail.order_count_held} held · ${detail.order_count_total} total`}
                />
                <StatCard
                  label="Posts"
                  primary={detail.post_count_approved}
                  secondary={`${detail.post_count} total`}
                />
              </div>
            </div>

            {/* ── Trust ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <StatCard label="Trust score"   primary={`${detail.trust_score ?? 0}%`} />
              <StatCard label="Avg rating"    primary={detail.avg_rating ? detail.avg_rating.toFixed(1) : '—'} secondary={`${detail.review_count} reviews`} />
              <StatCard label="Unique reporters" primary={detail.unique_reporter_count ?? 0} />
            </div>

            {/* ── Auto-review ── */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 10, textTransform: 'uppercase' }}>
                Auto-review
              </div>
              <AutoReviewScore score={detail.auto_review_score} issues={detail.auto_review_issues} />
              {detail.reviewed_at && (
                <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                  Last reviewed {new Date(detail.reviewed_at).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
              <button
                onClick={runAutoReview}
                disabled={autoReviewing}
                style={{
                  marginTop: 10, padding: '8px 16px', fontSize: 13, fontWeight: 600,
                  background: autoReviewing ? 'var(--border)' : 'var(--surface-2)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  cursor: autoReviewing ? 'not-allowed' : 'pointer', color: 'var(--text)',
                }}
              >
                {autoReviewing ? 'Running…' : '↻ Re-run auto-review'}
              </button>
            </div>

            {/* ── Manual approve / reject ── */}
            {(detail.subscription_status === 'unlisted' || detail.auto_review_score < 5) && (
              <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 12, textTransform: 'uppercase' }}>
                  Manual review action
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                  {detail.subscription_status === 'unlisted'
                    ? 'This business is awaiting review.'
                    : 'Auto-review flagged issues — override manually if satisfied.'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleManualStatus('verified')}
                    style={{
                      padding: '9px 18px', background: '#1D9E75', color: '#fff',
                      border: 'none', borderRadius: 8, fontSize: 13,
                      fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleManualStatus('rejected')}
                    style={{
                      padding: '9px 18px', background: 'var(--surface)',
                      border: '1px solid #A32D2D', borderRadius: 8,
                      fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#A32D2D',
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            )}

            {/* ── Subscription event log ── */}
            {detail.subscription_events && detail.subscription_events.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 10, textTransform: 'uppercase' }}>
                  Subscription history
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {detail.subscription_events.map((ev, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', background: 'var(--surface-2)',
                      borderRadius: 8, fontSize: 13,
                    }}>
                      <div>
                        <span style={{ fontWeight: 600 }}>{EVENT_LABELS[ev.event] ?? ev.event}</span>
                        {ev.detail && <span className="muted"> · {ev.detail}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        {ev.amount > 0 && (
                          <span style={{ color: '#0D6E82', fontWeight: 700 }}>−{formatChecks(ev.amount)}</span>
                        )}
                        <span className="muted" style={{ fontSize: 11 }}>
                          {new Date(ev.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showOverride && detail && (
        <OverrideModal
          businessId={business.id}
          currentStatus={detail.subscription_status}
          onClose={() => setShowOverride(false)}
          onSuccess={handleOverrideSuccess}
        />
      )}
    </>
  )
}
