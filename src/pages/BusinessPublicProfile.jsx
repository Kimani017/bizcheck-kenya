import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const STARS = [1, 2, 3, 4, 5]

function StarDisplay({ rating, size = 16 }) {
  return (
    <span>
      {STARS.map((s) => (
        <span key={s} style={{ color: s <= rating ? '#F5A623' : '#E5E3DC', fontSize: size }}>★</span>
      ))}
    </span>
  )
}

export default function BusinessPublicProfile({ business, onBack, onReport, currentUser }) {
  const [biz, setBiz] = useState(business)
  const [reviews, setReviews] = useState([])
  const [myReview, setMyReview] = useState(null)
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [voting, setVoting] = useState(false)
  const [voteMsg, setVoteMsg] = useState('')
  const [showClaimForm, setShowClaimForm] = useState(false)
  const [claimSubmitted, setClaimSubmitted] = useState(false)

  useEffect(() => {
    loadReviews()
    logView('profile_view')
  }, [])

  async function logView(type) {
    await supabase.from('profile_views').insert({
      business_id: biz.id,
      viewer_id: currentUser?.id || null,
      view_type: type,
    })
  }

  async function loadReviews() {
    const { data } = await supabase
      .from('reviews')
      .select('*, profiles(name, username)')
      .eq('business_id', biz.id)
      .order('created_at', { ascending: false })
    setReviews(data || [])
    if (currentUser) {
      const mine = (data || []).find((r) => r.reviewer_id === currentUser.id)
      if (mine) {
        setMyReview(mine)
        setRating(mine.rating)
        setReviewText(mine.review_text || '')
      }
    }
    // Refresh business data for latest ratings
    const { data: updated } = await supabase.from('businesses').select('*').eq('id', biz.id).single()
    if (updated) setBiz(updated)
  }

  async function submitReview() {
    if (!rating) { alert('Please select a star rating.'); return }
    setSubmitting(true)
    const payload = {
      business_id: biz.id,
      reviewer_id: currentUser.id,
      rating,
      review_text: reviewText || null,
    }
    if (myReview) {
      await supabase.from('reviews').update(payload).eq('id', myReview.id)
    } else {
      await supabase.from('reviews').insert(payload)
    }
    setSubmitting(false)
    loadReviews()
  }

  async function castVote(voteType) {
    if (!currentUser) { setVoteMsg('Please log in to vote.'); return }
    setVoting(true)
    await supabase.from('votes').upsert(
      { business_id: biz.id, user_id: currentUser.id, vote_type: voteType },
      { onConflict: 'business_id,user_id' }
    )
    const { data: updated } = await supabase.from('businesses').select('*').eq('id', biz.id).single()
    if (updated) setBiz(updated)
    setVoting(false)
    setVoteMsg(voteType === 'legit' ? '✓ Marked as legit — thank you!' : '⚠ Scam vote recorded — asante!')
  }

  const trustColor = biz.trust_score > 70 ? '#1D9E75' : biz.trust_score > 40 ? '#EF9F27' : '#E24B4A'

  return (
    <div className="section" style={{ maxWidth: 680 }}>
      <button className="link-btn" onClick={onBack}>← Back</button>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 24, marginBottom: 4 }}>{biz.name}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="badge badge-verified" style={{ fontSize: 12 }}>{biz.category}</span>
            {biz.location && <span className="muted">📍 {biz.location}</span>}
          </div>
        </div>
        <span className={`badge ${biz.status === 'verified' ? 'badge-verified' : 'badge-danger'}`} style={{ fontSize: 13, padding: '6px 14px' }}>
          {biz.status === 'verified' ? '✓ Verified' : '⚠ Flagged'}
        </span>
      </div>

      {/* RATINGS SUMMARY */}
      <div className="profile-ratings-bar">
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, fontWeight: 700, color: '#085041' }}>{biz.avg_rating > 0 ? biz.avg_rating.toFixed(1) : '—'}</div>
          <StarDisplay rating={Math.round(biz.avg_rating)} size={20} />
          <div className="muted" style={{ marginTop: 4 }}>{biz.review_count} review{biz.review_count !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="trust-label" style={{ marginBottom: 4 }}>
            <span>Community trust</span>
            <span style={{ color: trustColor, fontWeight: 600 }}>{biz.trust_score}%</span>
          </div>
          <div className="trust-bar"><div className="trust-fill" style={{ width: `${biz.trust_score}%`, background: trustColor }}></div></div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{biz.legit_votes} legit · {biz.scam_votes} scam · {biz.view_count} profile views</div>
        </div>
      </div>

      {/* BUSINESS DETAILS */}
      <div className="detail-rows" style={{ marginBottom: 16 }}>
        {biz.description && <div className="detail-row"><span>About</span><span>{biz.description}</span></div>}
        {biz.phone && <div className="detail-row"><span>Phone</span><span>{biz.phone}</span></div>}
        {biz.mpesa_till && <div className="detail-row"><span>M-Pesa till</span><span>{biz.mpesa_till}</span></div>}
        {biz.location && <div className="detail-row"><span>Location</span><span>{biz.location}</span></div>}
        {biz.fb_handle && <div className="detail-row"><span>Facebook</span><span style={{ color: '#1D9E75' }}>{biz.fb_handle}</span></div>}
        {biz.tiktok_handle && <div className="detail-row"><span>TikTok</span><span style={{ color: '#1D9E75' }}>{biz.tiktok_handle}</span></div>}
        {biz.instagram_handle && <div className="detail-row"><span>Instagram</span><span style={{ color: '#1D9E75' }}>{biz.instagram_handle}</span></div>}
      </div>

      {/* VOTE BUTTONS */}
      {voteMsg && <div className="vote-msg">{voteMsg}</div>}
      <div className="votes-row" style={{ marginBottom: 8 }}>
        <button className="vote-btn" disabled={voting} onClick={() => castVote('legit')}>👍 Legit ({biz.legit_votes})</button>
        <button className="vote-btn" disabled={voting} onClick={() => castVote('scam')}>👎 Scam ({biz.scam_votes})</button>
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <button className="link-btn report-link" style={{ margin: 0 }} onClick={() => onReport(biz)}>🚩 Report this seller</button>
        {!biz.owner_id && !claimSubmitted && (
          <button className="link-btn" style={{ margin: 0, color: '#085041' }} onClick={() => setShowClaimForm(!showClaimForm)}>
            🏢 Is this your business? Claim it
          </button>
        )}
      </div>

      {/* CLAIM FORM */}
      {showClaimForm && (
        <ClaimForm business={biz} currentUser={currentUser} onSubmitted={() => { setClaimSubmitted(true); setShowClaimForm(false) }} />
      )}

      {/* WRITE A REVIEW */}
      {currentUser && (
        <div className="review-write-box">
          <h3 style={{ marginBottom: 12 }}>{myReview ? 'Update your review' : 'Write a review'}</h3>
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {STARS.map((s) => (
              <span
                key={s}
                style={{ fontSize: 28, cursor: 'pointer', color: s <= (hoverRating || rating) ? '#F5A623' : '#E5E3DC' }}
                onClick={() => setRating(s)}
                onMouseEnter={() => setHoverRating(s)}
                onMouseLeave={() => setHoverRating(0)}
              >★</span>
            ))}
            {rating > 0 && <span className="muted" style={{ alignSelf: 'center', marginLeft: 8 }}>{['','Terrible','Poor','Average','Good','Excellent'][rating]}</span>}
          </div>
          <div className="form-group" style={{ marginBottom: 10 }}>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              rows={3}
              placeholder="Share your experience with this seller..."
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E3DC', fontSize: 14, fontFamily: 'inherit' }}
            />
          </div>
          <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }} onClick={submitReview} disabled={submitting}>
            {submitting ? 'Saving…' : myReview ? 'Update review' : 'Submit review'}
          </button>
        </div>
      )}

      {/* REVIEWS LIST */}
      <div style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 16 }}>Reviews ({reviews.length})</h3>
        {reviews.length === 0 ? (
          <p className="muted">No reviews yet — be the first to review this business.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {reviews.map((r) => (
              <div key={r.id} className="review-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="review-avatar">{(r.profiles?.username || r.profiles?.name || 'U')[0].toUpperCase()}</div>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 14 }}>{@${r.profiles?.username || r.profiles?.name || 'anonymous'}}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                    </div>
                  </div>
                  <StarDisplay rating={r.rating} size={14} />
                </div>
                {r.review_text && <p style={{ fontSize: 14, color: '#2C2C2A', lineHeight: 1.6 }}>{r.review_text}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ClaimForm({ business, currentUser, onSubmitted }) {
  const [idNumber, setIdNumber] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!idNumber.trim()) { alert('Please enter your ID number.'); return }
    setSubmitting(true)
    const { error } = await supabase.from('claim_requests').insert({
      business_id: business.id,
      claimant_id: currentUser.id,
      id_number: idNumber,
      reason: reason || null,
    })
    setSubmitting(false)
    if (error) { alert('Error submitting claim: ' + error.message); return }
    onSubmitted()
  }

  return (
    <div className="review-write-box" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 4 }}>Claim this business</h3>
      <p className="muted" style={{ marginBottom: 12 }}>Submit your details and our admin team will verify your ownership within 24hrs.</p>
      <div className="form-group">
        <label style={{ fontSize: 13, color: '#5F5E5A', marginBottom: 6, display: 'block', fontWeight: 500 }}>Your ID number</label>
        <input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="National ID or Business registration number" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E3DC', fontSize: 14 }} />
      </div>
      <div className="form-group">
        <label style={{ fontSize: 13, color: '#5F5E5A', marginBottom: 6, display: 'block', fontWeight: 500 }}>Why are you claiming this business?</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. I am the registered owner of this business..." style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E3DC', fontSize: 14, fontFamily: 'inherit' }} />
      </div>
      <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }} onClick={submit} disabled={submitting}>
        {submitting ? 'Submitting…' : 'Submit claim request'}
      </button>
    </div>
  )
}
