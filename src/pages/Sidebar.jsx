import { useState, useEffect } from 'react'

const NAV_ITEMS = (isAdmin) => [
  { id: 'home', label: 'Home' },
  { id: 'directory', label: 'Trusted Sellers' },
  { id: 'report', label: 'Report a Scammer' },
  ...(isAdmin ? [{ id: 'admin', label: 'Admin' }] : []),
  { id: 'userProfile', label: 'My Profile' },
]

export default function Sidebar({ page, navigate, openUserProfile, isAdmin, theme, toggleTheme, handleLogout, onExpandChange }) {
  const [isMobile, setIsMobile] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    function checkSize() { setIsMobile(window.innerWidth <= 768) }
    checkSize()
    window.addEventListener('resize', checkSize)
    return () => window.removeEventListener('resize', checkSize)
  }, [])

  // Desktop: hover to expand. Mobile: click hamburger to open/close.
  const expanded = isMobile ? mobileOpen : hovered

  // Let the parent know when the sidebar is expanded (desktop only)
  // so the page content can shift over instead of being covered.
  useEffect(() => {
    if (onExpandChange) onExpandChange(!isMobile && expanded)
  }, [expanded, isMobile])

  function handleNav(id) {
    if (id === 'userProfile') openUserProfile()
    else navigate(id)
    if (isMobile) setMobileOpen(false)
  }

  const items = NAV_ITEMS(isAdmin)

  return (
    <>
      {/* Mobile hamburger button — fixed top-left */}
      {isMobile && (
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          style={{
            position: 'fixed', top: 14, left: 14, zIndex: 200,
            width: 40, height: 40, borderRadius: 10,
            background: 'var(--surface)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      )}

      {/* Overlay behind mobile menu */}
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 150 }}
        />
      )}

      {/* Sidebar itself */}
      <div
        onMouseEnter={() => !isMobile && setHovered(true)}
        onMouseLeave={() => !isMobile && setHovered(false)}
        style={{
          position: 'fixed',
          top: isMobile ? 0 : 12,
          left: isMobile ? 0 : 12,
          height: isMobile ? '100vh' : 'calc(100vh - 24px)',
          width: expanded ? 220 : (isMobile ? 0 : 64),
          background: 'var(--nav-bg)',
          border: isMobile ? 'none' : '1px solid var(--border)',
          borderRadius: isMobile ? 0 : 16,
          boxShadow: isMobile ? 'none' : '0 4px 20px rgba(0,0,0,0.08)',
          display: 'flex', flexDirection: 'column',
          transition: 'width 0.2s ease',
          overflow: 'hidden', zIndex: 160,
          transform: isMobile && !mobileOpen ? 'translateX(-100%)' : 'translateX(0)',
        }}
      >
        {/* Logo */}
        <div
          onClick={() => handleNav('home')}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '18px 18px', cursor: 'pointer',
            borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#1D9E75', flexShrink: 0 }}></span>
          {expanded && <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-strong)' }}>BizCheck Kenya</span>}
        </div>

        {/* Nav items */}
        <div style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '11px 12px', borderRadius: 10, border: 'none',
                background: page === item.id ? 'var(--hover-bg)' : 'transparent',
                color: page === item.id ? '#1D9E75' : 'var(--text)',
                fontWeight: page === item.id ? 700 : 500,
                fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap',
                textAlign: 'left', width: '100%',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, flexShrink: 0, width: 22, textAlign: 'center' }}>{item.label[0]}</span>
              {expanded && <span>{item.label}</span>}
            </button>
          ))}
        </div>

        {/* Bottom section: Settings, Support, Logout */}
        <div style={{ padding: '8px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button
            onClick={() => handleNav('settings')}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '11px 12px',
              borderRadius: 10, border: 'none',
              background: page === 'settings' ? 'var(--hover-bg)' : 'transparent',
              color: page === 'settings' ? '#1D9E75' : 'var(--text)',
              fontWeight: page === 'settings' ? 700 : 500,
              fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'left', width: '100%',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, flexShrink: 0, width: 22, textAlign: 'center' }}>S</span>
            {expanded && <span>Settings</span>}
          </button>

          <button
            onClick={() => handleNav('support')}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '11px 12px',
              borderRadius: 10, border: 'none',
              background: page === 'support' ? 'var(--hover-bg)' : 'transparent',
              color: page === 'support' ? '#1D9E75' : 'var(--text)',
              fontWeight: page === 'support' ? 700 : 500,
              fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'left', width: '100%',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, flexShrink: 0, width: 22, textAlign: 'center' }}>H</span>
            {expanded && <span>Support</span>}
          </button>

          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '11px 12px',
              borderRadius: 10, border: 'none', background: 'transparent', color: '#E24B4A',
              fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'left', width: '100%',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, flexShrink: 0, width: 22, textAlign: 'center' }}>L</span>
            {expanded && <span>Log out</span>}
          </button>
        </div>
      </div>
    </>
  )
}
