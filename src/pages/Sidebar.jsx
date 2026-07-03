import { useState, useEffect } from 'react'

const NAV_ITEMS = (isAdmin) => [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'directory', label: 'Trusted Sellers', icon: '🛡️' },
  { id: 'report', label: 'Report a Scammer', icon: '🚩' },
  ...(isAdmin ? [{ id: 'admin', label: 'Admin', icon: '⚙️' }] : []),
  { id: 'userProfile', label: 'My Profile', icon: '👤' },
]

export default function Sidebar({ page, navigate, openUserProfile, isAdmin, theme, toggleTheme, handleLogout }) {
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
          position: 'fixed', top: 0, left: 0, height: '100vh',
          width: expanded ? 220 : (isMobile ? 0 : 64),
          background: 'var(--nav-bg)', borderRight: '1px solid var(--border)',
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
            padding: '18px 20px', cursor: 'pointer',
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
              <span style={{ fontSize: 18, flexShrink: 0, width: 22, textAlign: 'center' }}>{item.icon}</span>
              {expanded && <span>{item.label}</span>}
            </button>
          ))}
        </div>

        {/* Bottom section: Settings, Support, Theme, Logout */}
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
            <span style={{ fontSize: 18, flexShrink: 0, width: 22, textAlign: 'center' }}>⚙️</span>
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
            <span style={{ fontSize: 18, flexShrink: 0, width: 22, textAlign: 'center' }}>💬</span>
            {expanded && <span>Support</span>}
          </button>

          <button
            onClick={toggleTheme}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '11px 12px',
              borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--text)',
              fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'left', width: '100%',
            }}
          >
            <span style={{ fontSize: 18, flexShrink: 0, width: 22, textAlign: 'center' }}>{theme === 'light' ? '🌙' : '☀️'}</span>
            {expanded && <span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>}
          </button>

          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '11px 12px',
              borderRadius: 10, border: 'none', background: 'transparent', color: '#E24B4A',
              fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'left', width: '100%',
            }}
          >
            <span style={{ fontSize: 18, flexShrink: 0, width: 22, textAlign: 'center' }}>🚪</span>
            {expanded && <span>Log out</span>}
          </button>
        </div>
      </div>
    </>
  )
}
