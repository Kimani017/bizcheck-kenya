import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import Landing from './pages/Landing'
import Home from './pages/Home'
import Directory from './pages/Directory'
import ReportForm from './pages/ReportForm'
import BusinessPublicProfile from './pages/BusinessPublicProfile'
import BusinessPrivateDashboard from './pages/BusinessPrivateDashboard'
import UserProfile from './pages/UserProfile'
import Auth from './pages/Auth'
import SubmitBusiness from './pages/SubmitBusiness'
import AdminDashboard from './pages/AdminDashboard'
import SetUsername from './pages/SetUsername'
import ResetPassword from './pages/ResetPassword'
import AdminProfiles from './pages/AdminProfiles'
import AdminApplicationForm from './pages/AdminApplicationForm'
import EnterAdminCode from './pages/EnterAdminCode'
import Settings from './pages/Settings'
import Support from './pages/Support'
import './App.css'

const NAV_KEY = 'bizcheck_nav_state'

function App() {
  const [page, setPage] = useState('home')
  const [selectedBusiness, setSelectedBusiness] = useState(null)
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [reportPrefill, setReportPrefill] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [needsUsername, setNeedsUsername] = useState(false)
  const [recoveringPassword, setRecoveringPassword] = useState(false)
  const [pendingApplication, setPendingApplication] = useState(null)
  const [restoring, setRestoring] = useState(true)
  const [theme, setTheme] = useState(() => localStorage.getItem('bizcheck_theme') || 'light')
  const [isMobileView, setIsMobileView] = useState(window.innerWidth <= 768)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isRestoringRef = useRef(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('bizcheck_theme', theme)
  }, [theme])

  function toggleTheme() {
    setTheme(t => t === 'light' ? 'dark' : 'light')
  }

  useEffect(() => {
    function checkSize() { setIsMobileView(window.innerWidth <= 768) }
    window.addEventListener('resize', checkSize)
    return () => window.removeEventListener('resize', checkSize)
  }, [])

  // Close mobile menu whenever the page changes
  useEffect(() => { setMobileMenuOpen(false) }, [page])

  function navigate(newPage, opts = {}) {
    const { business = undefined, userId = undefined, mode = undefined, replace = false } = opts

    if (business !== undefined) setSelectedBusiness(business)
    if (userId !== undefined) setSelectedUserId(userId)
    if (mode !== undefined) setAuthMode(mode)
    setPage(newPage)

    if (isRestoringRef.current) return

    const navState = {
      page: newPage,
      businessId: business !== undefined ? (business?.id || null) : (selectedBusiness?.id || null),
      userId: userId !== undefined ? userId : selectedUserId,
      authMode: mode !== undefined ? mode : authMode,
    }

    sessionStorage.setItem(NAV_KEY, JSON.stringify(navState))
    const url = `#${newPage}`
    if (replace) window.history.replaceState(navState, '', url)
    else window.history.pushState(navState, '', url)
  }

  async function restoreNavState(navState) {
    if (!navState) return
    // Never restore to the auth page — if we have a session we belong on home
    if (navState.page === 'auth') { setPage('home'); return }
    isRestoringRef.current = true
    try {
      if (navState.authMode) setAuthMode(navState.authMode)
      if (navState.businessId && ['bizProfile', 'bizDashboard'].includes(navState.page)) {
        const { data: biz } = await supabase.from('businesses').select('*').eq('id', navState.businessId).single()
        if (biz) setSelectedBusiness(biz)
      }
      if (navState.userId && navState.page === 'userProfile') {
        setSelectedUserId(navState.userId)
      }
      setPage(navState.page || 'home')
    } finally {
      isRestoringRef.current = false
    }
  }

  useEffect(() => {
    init()

    const onPopState = (event) => {
      if (event.state && event.state.page) {
        restoreNavState(event.state)
      } else {
        isRestoringRef.current = true
        setPage('home')
        setSelectedBusiness(null)
        setSelectedUserId(null)
        isRestoringRef.current = false
      }
    }
    window.addEventListener('popstate', onPopState)

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // User clicked the reset link — show the set-new-password screen
        setUser(session?.user || null)
        setRecoveringPassword(true)
        return
      }
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setIsAdmin(false)
        setNeedsUsername(false)
        sessionStorage.removeItem(NAV_KEY)
        return
      }
      if (event === 'SIGNED_IN') {
        setUser(session?.user || null)
        if (session?.user) {
          checkAdmin(session.user.id)
          checkUsername(session.user.id)
          // Always land on home after login — clear any 'auth' page state
          // (covers both email login and Google OAuth redirect back to #auth)
          setSelectedBusiness(null)
          setSelectedUserId(null)
          setPage('home')
          sessionStorage.setItem(NAV_KEY, JSON.stringify({ page: 'home' }))
          window.history.replaceState({ page: 'home' }, '', '#home')
        }
        return
      }
      if (session?.user) {
        setUser(session.user)
        checkAdmin(session.user.id)
      }
    })

    return () => {
      listener.subscription.unsubscribe()
      window.removeEventListener('popstate', onPopState)
    }
  }, [])

  async function init() {
    const { data } = await supabase.auth.getUser()
    const currentUser = data.user || null
    setUser(currentUser)
    if (currentUser) {
      await Promise.all([checkAdmin(currentUser.id), checkUsername(currentUser.id), checkPendingApplication(currentUser.id)])
    }
    setCheckingAuth(false)

    const saved = sessionStorage.getItem(NAV_KEY)
    if (saved) {
      try {
        const navState = JSON.parse(saved)
        await restoreNavState(navState)
        window.history.replaceState(navState, '', `#${navState.page}`)
      } catch (e) {
        console.error('Failed to restore nav state:', e)
      }
    } else {
      window.history.replaceState({ page: 'home' }, '', '#home')
    }
    setRestoring(false)
  }

  async function checkUsername(userId) {
    let attempts = 0
    while (attempts < 3) {
      const { data: profile, error } = await supabase.from('profiles').select('username').eq('id', userId).single()
      if (!error) {
        const hasUsername = profile?.username && profile.username.length >= 3
        setNeedsUsername(!hasUsername)
        return
      }
      attempts++
      await new Promise(r => setTimeout(r, 1000))
    }
    setNeedsUsername(false)
  }

  async function checkPendingApplication(userId) {
    const { data } = await supabase.from('admin_applications').select('status').eq('user_id', userId).single()
    if (data && (data.status === 'invited' || data.status === 'approved')) {
      setPendingApplication(data.status)
    } else {
      setPendingApplication(null)
    }
  }

  async function checkAdmin(userId) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single()
    setIsAdmin(!!profile && ['admin', 'superadmin'].includes(profile.role))
  }

  function openBusiness(business) {
    supabase.from('profile_views').insert({
      business_id: business.id,
      viewer_id: user?.id || null,
      view_type: 'card_click',
    })
    if (user && business.owner_id === user.id) {
      navigate('bizDashboard', { business })
    } else {
      navigate('bizProfile', { business })
    }
  }

  function openUserProfile(userId) {
    navigate('userProfile', { userId: userId || user?.id })
  }

  function goToReport(business = null) {
    setReportPrefill(business)
    navigate('report')
  }

  function goToAuth(mode = 'login') {
    navigate('auth', { mode })
  }

  function goToSubmit() {
    if (!user) { goToAuth('signup'); return }
    navigate('submit')
  }

  function goBack() {
    window.history.back()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setUser(null)
    setIsAdmin(false)
    sessionStorage.removeItem(NAV_KEY)
    navigate('home', { business: null, userId: null })
  }

  if (checkingAuth || restoring) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
        <div style={{ color: '#1D9E75', fontSize: 16 }}>Loading…</div>
      </div>
    )
  }

  if (recoveringPassword) {
    return <ResetPassword onDone={() => { setRecoveringPassword(false); navigate('home') }} />
  }

  if (user && needsUsername) {
    return <SetUsername user={user} onDone={() => setNeedsUsername(false)} />
  }

  if (user && pendingApplication === 'invited') {
    return <AdminApplicationForm currentUser={user} onDone={() => { setPendingApplication('submitted'); checkPendingApplication(user.id) }} />
  }

  if (user && pendingApplication === 'approved') {
    return (
      <EnterAdminCode
        onActivated={() => { setPendingApplication(null); checkAdmin(user.id); navigate('home') }}
        onBack={() => setPendingApplication(null)}
      />
    )
  }

  // Not logged in — no sidebar, simple top nav for landing/auth
  if (!user) {
    return (
      <div className="app">
        <nav className="navbar">
          <div className="logo" onClick={() => navigate('home')}>
            <span className="logo-dot"></span> BizCheck Kenya
          </div>
          <div className="nav-links">
            <button className="theme-toggle" onClick={toggleTheme}>{theme === 'light' ? '🌙' : '☀️'} {theme === 'light' ? 'Dark' : 'Light'}</button>
            <button className={page === 'auth' && authMode === 'login' ? 'active' : ''} onClick={() => goToAuth('login')}>Log in</button>
            <button className="btn-signup" onClick={() => goToAuth('signup')}>Sign up</button>
          </div>
        </nav>
        {page === 'auth' ? <Auth onAuthed={() => navigate('home')} initialMode={authMode} /> : <Landing goToAuth={goToAuth} />}
      </div>
    )
  }

  // Logged in — centered horizontal top nav
  return (
    <div className="app">
      {!isMobileView ? (
        // DESKTOP — centered horizontal navbar
        <nav className="navbar navbar-grid">
          <div className="logo" onClick={() => navigate('home')}>
            <span className="logo-dot"></span> BizCheck Kenya
          </div>

          <div className="nav-links nav-links-center">
            <button className={page === 'home' ? 'active' : ''} onClick={() => navigate('home')}>Home</button>
            <button className={page === 'directory' ? 'active' : ''} onClick={() => navigate('directory')}>Trusted Sellers</button>
            <button className={page === 'report' ? 'active' : ''} onClick={() => goToReport(null)}>Report a Scammer</button>
            {isAdmin && <button className={page === 'admin' ? 'active' : ''} onClick={() => navigate('admin')}>Admin</button>}
            {isAdmin
              ? <button className={page === 'adminProfiles' ? 'active' : ''} onClick={() => navigate('adminProfiles')}>Profiles</button>
              : <button className={page === 'userProfile' ? 'active' : ''} onClick={() => openUserProfile(user.id)}>My Profile</button>}
          </div>

          <div className="nav-links nav-links-right">
            <button className={page === 'settings' ? 'active' : ''} onClick={() => navigate('settings')}>Settings</button>
            <button className={page === 'support' ? 'active' : ''} onClick={() => navigate('support')}>Support</button>
            <button onClick={handleLogout}>Log out</button>
          </div>
        </nav>
      ) : (
        // MOBILE — hamburger button (left) + vertical slide-in drawer
        <>
          <div className="mobile-topbar">
            <button className="hamburger-btn" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu">☰</button>
            <div className="logo" onClick={() => navigate('home')}>
              <span className="logo-dot"></span> BizCheck Kenya
            </div>
            <div style={{ width: 40 }} />
          </div>

          {mobileMenuOpen && (
            <div className="mobile-menu-overlay" onClick={() => setMobileMenuOpen(false)} />
          )}

          <div className={`mobile-menu-drawer ${mobileMenuOpen ? 'open' : ''}`}>
            <div className="mobile-menu-header">
              <div className="logo">
                <span className="logo-dot"></span> BizCheck Kenya
              </div>
              <button className="hamburger-btn" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu">✕</button>
            </div>
            <div className="mobile-menu-links">
              <button className={page === 'home' ? 'active' : ''} onClick={() => navigate('home')}>Home</button>
              <button className={page === 'directory' ? 'active' : ''} onClick={() => navigate('directory')}>Trusted Sellers</button>
              <button className={page === 'report' ? 'active' : ''} onClick={() => goToReport(null)}>Report a Scammer</button>
              {isAdmin && <button className={page === 'admin' ? 'active' : ''} onClick={() => navigate('admin')}>Admin</button>}
              {isAdmin
              ? <button className={page === 'adminProfiles' ? 'active' : ''} onClick={() => navigate('adminProfiles')}>Profiles</button>
              : <button className={page === 'userProfile' ? 'active' : ''} onClick={() => openUserProfile(user.id)}>My Profile</button>}
              <div className="mobile-menu-divider" />
              <button className={page === 'settings' ? 'active' : ''} onClick={() => navigate('settings')}>Settings</button>
              <button className={page === 'support' ? 'active' : ''} onClick={() => navigate('support')}>Support</button>
              <button onClick={handleLogout} style={{ color: '#E24B4A' }}>Log out</button>
            </div>
          </div>
        </>
      )}

      <div className="main-content">
        {page === 'home' && <Home onSelectBusiness={openBusiness} goToReport={() => goToReport(null)} />}
        {page === 'directory' && <Directory onSelectBusiness={openBusiness} goToSubmit={goToSubmit} />}
        {page === 'report' && <ReportForm onDone={() => navigate('home')} prefill={reportPrefill} />}
        {page === 'submit' && <SubmitBusiness onDone={() => navigate('directory')} />}
        {page === 'admin' && <AdminDashboard onSelectBusiness={openBusiness} onSelectUser={openUserProfile} />}
        {page === 'adminProfiles' && <AdminProfiles onSelectBusiness={openBusiness} onSelectUser={openUserProfile} currentUser={user} />}
        {page === 'settings' && <Settings theme={theme} toggleTheme={toggleTheme} onBack={goBack} />}
        {page === 'support' && <Support onBack={goBack} currentUser={user} />}
        {page === 'bizProfile' && selectedBusiness && (
          <BusinessPublicProfile
            business={selectedBusiness}
            onBack={goBack}
            onReport={goToReport}
            currentUser={user}
            isAdmin={isAdmin}
          />
        )}
        {page === 'bizDashboard' && selectedBusiness && (
          <BusinessPrivateDashboard
            business={selectedBusiness}
            onBack={goBack}
            currentUser={user}
          />
        )}
        {page === 'userProfile' && selectedUserId && (
          <UserProfile
            profileUserId={selectedUserId}
            currentUser={user}
            isAdmin={isAdmin}
            onBack={goBack}
            onSelectBusiness={openBusiness}
          />
        )}
      </div>
    </div>
  )
}

export default App
