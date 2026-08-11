// Avatar for comment/review authors. Uses a profile photo when one exists,
// otherwise falls back to a coloured initial circle. The colour is derived
// from the username so the same person always gets the same colour.

const PALETTE = ['#1D9E75', '#0F6E56', '#2E7D9A', '#8B5A9F', '#C77D3E', '#B5544F', '#4A6FA5', '#6B8E4E']

function colorFor(name = '') {
  let sum = 0
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i)
  return PALETTE[sum % PALETTE.length]
}

export default function Avatar({ username, name, photoUrl, size = 30 }) {
  const label = username || name || 'user'
  const initial = label.replace(/^@/, '')[0]?.toUpperCase() || 'U'

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }

  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: colorFor(label),
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.42,
        fontWeight: 700,
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {initial}
    </div>
  )
}

// Shared header row for a comment or review: avatar + username (+ optional
// timestamp / trailing element like a star rating).
export function AuthorRow({ username, name, photoUrl, timestamp, trailing, size = 30 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 5 }}>
      <Avatar username={username} name={name} photoUrl={photoUrl} size={size} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', lineHeight: 1.2 }}>
          @{username || 'user'}
        </p>
        {timestamp && (
          <p className="muted" style={{ fontSize: 11, lineHeight: 1.2 }}>
            {new Date(timestamp).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        )}
      </div>
      {trailing}
    </div>
  )
}
