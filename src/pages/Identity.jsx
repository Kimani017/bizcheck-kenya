// Reusable identity display — enforces the reserved @SuperAdmin
// name + blue tick, and the green tick for regular admins.

export function displayName(profile) {
  if (!profile) return 'user'
  if (profile.role === 'superadmin') return 'SuperAdmin'
  return profile.username || 'user'
}

export function IdentityBadge({ profile, size = 14 }) {
  if (!profile) return null
  if (profile.role === 'superadmin') {
    return (
      <span title="Superadmin — verified" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size + 2, height: size + 2, borderRadius: '50%', background: '#1877F2', marginLeft: 4, flexShrink: 0 }}>
        <svg width={size - 4} height={size - 4} viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </span>
    )
  }
  if (profile.role === 'admin') {
    return (
      <span title="Admin — verified" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size + 2, height: size + 2, borderRadius: '50%', background: '#1D9E75', marginLeft: 4, flexShrink: 0 }}>
        <svg width={size - 4} height={size - 4} viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </span>
    )
  }
  return null
}

export function IdentityLine({ profile, size = 14, fontWeight = 600, color }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontWeight, color }}>
      @{displayName(profile)}
      <IdentityBadge profile={profile} size={size} />
    </span>
  )
}
