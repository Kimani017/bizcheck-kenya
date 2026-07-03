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
  const [restoring, setRestoring] = useState(true)
  const isRestoringRef = useRef(false)

  // ============================================================
  // NAVIGATION — persists across reload and supports back button
  // ============================================================

  // Build a lightweight nav snapshot (ids only, not full objects)
  function buildNavState(overrides = {}) {
    return {
      page,
      businessId: selectedBusiness?.id || null,
      userId: selectedUserId || null,
      authMode,
      ...overrides,
    }
  }

  // Central navigation function — replaces direct setPage() calls
  function navigate(newPage, opts = {}) {
    const { business = undefined, userId = undefined, mode = undefined, replace = false } = opts

    if (business !== undefined) setSelectedBusiness(business)
    if (userId !== undefined) setSelectedUserId(userId)
    if (mode !== undefined) setAuthMode(mode)
    setPage(newPage)

    if (isRestoringRef.current) return // don't push history while restoring

    const navState = {
      page: newPage,
      businessId: business !== undefined ? (business?.id || null) : (selectedBusiness?.id || null),
      userId: userId !== undefined ? userId : selectedUserId,
      authMode: mode !== undefined ? mode : authMode,
    }

    sessionStorage.setItem(NAV_KEY, JSON.stringify(navState))

    const url = `#${newPage}`
    if (replace) {
      window.history.replaceState(navState, '', url)
    } else {
      window.history.pushState(navState, '', url)
    }
  }

  // Restore a nav state (from reload or popstate) by fetching any needed data
  async function restoreNavState(navState) {
    if (!navState) return
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

    // Handle browser back/forward buttons
    const onPopState = (event) => {
      if (event.state) {
        restoreNavState(event.state)
      } else {
        setPage('home')
        setSelectedBusiness(null)
        setSelectedUserId(null)
      }
    }
    window.addEventListener('popstate', onPopState)

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
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
      await Promise.all([checkAdmin(currentUser.id), checkUsername(currentUser.id)])
    }
    setCheckingAuth(false)

    // Restore navigation from sessionStorage (survives reload)
    const saved = sessionStorage.getItem(NAV_KEY)
    if (saved) {
      try {
        const navState = JSON.parse(saved)
        await restoreNavState(navState)
        // Set initial history entry so back button works from here
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
    navigate('userProfile', { userId })
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

  async function handleLogout() {
    await supabase.auth.signOut()
    setUser(null)
    setIsAdmin(false)
    sessionStorage.removeItem(NAV_KEY)
    navigate('home', { business: null, userId: null })
  }

  if (checkingAuth || restoring) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ color: '#1D9E75', fontSize: 16 }}>Loading…</div>
      </div>
    )
  }

  if (user && needsUsername) {
    return <SetUsername user={user} onDone={() => setNeedsUsername(false)} />
  }

  // Not logged in
  if (!user) {
    return (
      <div className="app">
        <nav className="navbar">
          <div className="logo" onClick={() => navigate('home')}>
            <span className="logo-dot"></span> BizCheck Kenya
          </div>
          <div className="nav-links">
            <button className={page === 'auth' && authMode === 'login' ? 'active' : ''} onClick={() => goToAuth('login')}>Log in</button>
            <button className="btn-signup" onClick={() => goToAuth('signup')}>Sign up</button>
          </div>
        </nav>
        {page === 'auth' ? <Auth onAuthed={() => navigate('home')} initialMode={authMode} /> : <Landing goToAuth={goToAuth} />}
      </div>
    )
  }

  // Logged in
  return (
    <div className="app">
      <nav className="navbar">
        <div className="logo" onClick={() => navigate('home')}>
          <span className="logo-dot"></span> BizCheck Kenya
        </div>
        <div className="nav-links">
          <button className={page === 'home' ? 'active' : ''} onClick={() => navigate('home')}>Home</button>
          <button className={page === 'directory' ? 'active' : ''} onClick={() => navigate('directory')}>Trusted Sellers</button>
          <button className={page === 'report' ? 'active' : ''} onClick={() => goToReport(null)}>Report a Scammer</button>
          {isAdmin && <button className={page === 'admin' ? 'active' : ''} onClick={() => navigate('admin')}>Admin</button>}
          <button onClick={() => openUserProfile(user.id)}>My Profile</button>
          <button onClick={handleLogout}>Log out</button>
        </div>
      </nav>

      {page === 'home' && <Home onSelectBusiness={openBusiness} goToReport={() => goToReport(null)} />}
      {page === 'directory' && <Directory onSelectBusiness={openBusiness} goToSubmit={goToSubmit} />}
      {page === 'report' && <ReportForm onDone={() => navigate('home')} prefill={reportPrefill} />}
      {page === 'submit' && <SubmitBusiness onDone={() => navigate('directory')} />}
      {page === 'admin' && <AdminDashboard />}
      {page === 'bizProfile' && selectedBusiness && (
        <BusinessPublicProfile
          business={selectedBusiness}
          onBack={() => navigate('home')}
          onReport={goToReport}
          currentUser={user}
        />
      )}
      {page === 'bizDashboard' && selectedBusiness && (
        <BusinessPrivateDashboard
          business={selectedBusiness}
          onBack={() => navigate('home')}
          currentUser={user}
        />
      )}
      {page === 'userProfile' && selectedUserId && (
        <UserProfile
          profileUserId={selectedUserId}
          currentUser={user}
          isAdmin={isAdmin}
          onBack={() => navigate('home')}
          onSelectBusiness={openBusiness}
        />
      )}
    </div>
  )
}

export default App
