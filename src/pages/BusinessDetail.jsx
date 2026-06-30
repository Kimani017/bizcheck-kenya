import { useState } from 'react'
import { supabase } from '../supabase'

export default function BusinessDetail({ business, onBack, onReport }) {
  const [biz, setBiz] = useState(business)
  const [voting, setVoting] = useState(false)
  const [voteMsg, setVoteMsg] = useState('')

  const trustColor = biz.trust_score > 70 ? '#1D9E75' : biz.trust_score > 40 ? '#EF9F27' : '#E24B4A'

  async function castVote(voteType) {
    setVoting(true)
    setVoteMsg('')

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setVoteMsg('Please log in to vote on this business.')
      setVoting(false)
      return
    }

    const { error } = await supabase.from('votes').upsert(
      { business_id: biz.id, user_id: user.id, vote_type: voteType },
      { onConflict: 'business_id,user_id' }
    )

    setVoting(false)

    if (error) {
      console.error(error)
      setVoteMsg('Something went wrong. Please try again.')
      return
    }

    // Re-fetch the business to get the updated trust score
    const { data: updated } = await supabase.from('businesses').select('*').eq('id', biz.id).single()
    if (updated) setBiz(updated)
    setVoteMsg(voteType === 'legit' ? '✓ Marked as legit — thank you!' : '⚠ Scam report noted — asante!')
  }

  return (
    <div className="section" style={{ maxWidth: 600 }}>
      <button className="link-btn" onClick={onBack}>← Back</button>

      <div className="detail-top">
        <div>
          <h2>{biz.name}</h2>
          <div className="biz-cat">{biz.category}</div>
        </div>
      </div>

      {biz.status === 'verified' ? (
        <div className="banner banner-ok">
          <strong>Verified business</strong>
          <p>Reviewed by BizCheck admin and community</p>
        </div>
      ) : (
        <div className="banner banner-warn">
          <strong>Flagged — exercise caution</strong>
          <p>Multiple community reports against this seller</p>
        </div>
      )}

      <div className="detail-rows">
        <div className="detail-row"><span>Description</span><span>{biz.description || '—'}</span></div>
        <div className="detail-row"><span>Phone</span><span>{biz.phone || '—'}</span></div>
        <div className="detail-row"><span>M-Pesa till</span><span>{biz.mpesa_till || '—'}</span></div>
        <div className="detail-row"><span>Facebook</span><span>{biz.fb_handle || '—'}</span></div>
        <div className="detail-row"><span>TikTok</span><span>{biz.tiktok_handle || '—'}</span></div>
        <div className="detail-row">
          <span>Trust score</span>
          <span style={{ color: trustColor, fontWeight: 500 }}>
            {biz.trust_score}% — {biz.legit_votes} legit, {biz.scam_votes} scam reports
          </span>
        </div>
      </div>

      {voteMsg && <div className="vote-msg">{voteMsg}</div>}

      <div className="votes-row">
        <button className="vote-btn legit-btn" disabled={voting} onClick={() => castVote('legit')}>
          👍 Legit ({biz.legit_votes})
        </button>
        <button className="vote-btn scam-btn" disabled={voting} onClick={() => castVote('scam')}>
          👎 Scam ({biz.scam_votes})
        </button>
      </div>

      <button className="link-btn report-link" onClick={onReport}>🚩 Report this seller</button>
    </div>
  )
}
