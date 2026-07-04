// Reusable ghost/skeleton loading placeholders

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-line" style={{ width: '60%', height: 16 }} />
      <div className="skeleton-line" style={{ width: '35%' }} />
      <div className="skeleton-line" style={{ width: '100%', height: 6, marginTop: 6 }} />
      <div className="skeleton-line" style={{ width: '45%', marginTop: 4 }} />
    </div>
  )
}

export function SkeletonGrid({ count = 6 }) {
  return (
    <div className="skeleton-grid">
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  )
}

export function SkeletonList({ count = 5 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-card" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="skeleton-line" style={{ width: '50%', height: 14 }} />
            <div className="skeleton-line" style={{ width: '30%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonProfile() {
  return (
    <div className="section" style={{ maxWidth: 680 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div className="skeleton" style={{ width: 70, height: 70, borderRadius: '50%' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="skeleton-line" style={{ width: '40%', height: 18 }} />
          <div className="skeleton-line" style={{ width: '25%' }} />
        </div>
      </div>
      <SkeletonList count={3} />
    </div>
  )
}
