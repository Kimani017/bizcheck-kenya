import { useState } from 'react'
import { supabase } from '../supabase'
import ReportForm from './ReportForm'
import ReportUserModal from './ReportUserModal'

export default function ReportTab({ currentUser, businessMode, onMessageUser, onDone }) {
  const [subtab, setSubtab] = useState('business') // business | user

  return (
    <div className="section" style={{ maxWidth: 640 }}>
      <h2 style={{ marginBottom: 6 }}>Report</h2>
      <p className="muted" style={{ marginBottom: 20 }}>Report a scam business, or a user who has misbehaved toward your business.</p>

      <div className="filter-row" style={{ marginBottom: 20 }}>
        <button className={`filter-btn ${subtab === 'business' ? 'on' : ''}`} onClick={() => setSubtab('business')}>Report a Business</button>
        <button className={`filter-btn ${subtab === 'user' ? 'on' : ''}`} onClick={() => setSubtab('user')}>Report a User</button>
      </div>

      {subtab === 'business' && (
        <ReportForm currentUser={currentUser} onDone={onDone} prefill={null} />
      )}

      {subtab === 'user' && (
        <ReportUserSearch currentUser={currentUser} businessMode={businessMode} onMessageUser={onMessageUser} />
      )}
    </div>
  )
}

// ── Search users by username only, then Message or Report them ──
function ReportUserSearch({ currentUser, businessMode, onMessageUser }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchTimeout, setSearchTimeout] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [showReportModal, setShowReportModal] = useState(false)

  function handleChange(value) {
    setQuery(value)
    setSelectedUser(null)
    if (searchTimeout) clearTimeout(searchTimeout)
    if (!value.trim()) { setResults([]); return }
    const t = setTimeout(() => search(value), 300)
    setSearchTimeout(t)
  }

  async function search(q) {
    setSearching(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, username, role')
      .ilike('username', `%${q.trim()}%`)
      .neq('id', currentUser.id)
      .limit(10)
    setResults(data || [])
    setSearching(false)
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <div className="search-wrap" style={{ marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Search by username…"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
        />
      </div>

      {searching && <p className="muted">Searching…</p>}
      {!searching && query.trim() && results.length === 0 && (
        <p className="muted">No users found matching "{query}".</p>
      )}

      {!selectedUser && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {results.map((u) => (
            <button
              key={u.id}
              onClick={() => setSelectedUser(u)}
              style={{ textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', cursor: 'pointer' }}
            >
              <strong>@{u.username || 'user'}</strong>
            </button>
          ))}
        </div>
      )}

      {selectedUser && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <strong style={{ fontSize: 16 }}>@{selectedUser.username || 'user'}</strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => onMessageUser(selectedUser.id)}
                style={{ padding: '8px 16px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                💬 Message
              </button>
              <button
                onClick={() => setShowReportModal(true)}
                style={{ padding: '8px 16px', background: '#E24B4A', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                🚩 Report
              </button>
            </div>
          </div>
          <button className="link-btn" style={{ marginTop: 10 }} onClick={() => setSelectedUser(null)}>← Search again</button>
        </div>
      )}

      {showReportModal && selectedUser && (
        <ReportUserModal
          reportedUserId={selectedUser.id}
          reportedUsername={selectedUser.username || 'user'}
          businessId={businessMode?.id || null}
          currentUser={currentUser}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  )
}
