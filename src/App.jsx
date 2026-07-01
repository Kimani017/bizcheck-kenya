import { useState, useEffect } from 'react'
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
import './App.css'

function App() {
  const [page, setPage] = useState('home')
  const [selectedBusiness, setSelectedBusiness] = useState(null)
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [reportPrefill, setReportPrefill] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    init()
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
      if (session?.user) checkAdmin(session.user.id)
      else setIsAdmin(false)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function init() {
    const { data } = await supabase.auth.getUser()
    setUser(data.user || null)
    if (data.user) await checkAdmin(data.user.id)
    setCheckingAuth(false)
  }

  async function checkAdmin(userId) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single()
    setIsAdmin(!!profile && ['admin', 'superadmin'].includes(profile.role))
  }

  function openBusiness(business) {
    setSelectedBusiness(business)
    // Log card click
    supabase.from('profile_views').insert({
      business_id: business.id,
      viewer_id: user?.id || null,
      view_type: 'card_click',
    })
    // Check if current user is the owner
    if (user && business.owner_id === user.id) {
      setPage('bizDashboard')
    } else {
      setPage('bizProfile')
    }
  }

  function openUserProfile(userId) {
    setSelectedUserId(userId)
    setPage('userProfile')
  }

  function goToReport(business = null) {
    setReportPrefill(business)
    setPage('report')
  }

  function goToAuth(mode = 'login') {
    setAuthMode(mode)
    setPage('auth')
  }

  function goToSubmit() {
    if (!user) { goToAuth('signup'); return }
    setPage('submit')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setUser(null)
    setIsAdmin(false)
    setPage('home')
  }

  if (checkingAuth) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ color: '#1D9E75', fontSize: 16 }}>Loading…</div>
      </div>
    )
  }

  // Not logged in
  if (!user) {
    return (
      <div className="app">
        <nav className="navbar">
          <div className="logo" onClick={() => setPage('home')}>
            <span className="logo-dot"></span> BizCheck Kenya
          </div>
          <div className="nav-links">
            <button className={page === 'auth' && authMode === 'login' ? 'active' : ''} onClick={() => goToAuth('login')}>Log in</button>
            <button className="btn-signup" onClick={() => goToAuth('signup')}>Sign up</button>
          </div>
        </nav>
        {page === 'auth' ? <Auth onAuthed={() => setPage('home')} initialMode={authMode} /> : <Landing goToAuth={goToAuth} />}
      </div>
    )
  }

  // Logged in
  return (
    <div className="app">
      <nav className="navbar">
        <div className="logo" onClick={() => setPage('home')}>
          <span className="logo-dot"></span> BizCheck Kenya
        </div>
        <div className="nav-links">
          <button className={page === 'home' ? 'active' : ''} onClick={() => setPage('home')}>Home</button>
          <button className={page === 'directory' ? 'active' : ''} onClick={() => setPage('directory')}>Trusted Sellers</button>
          <button className={page === 'report' ? 'active' : ''} onClick={() => goToReport(null)}>Report a Scammer</button>
          {isAdmin && <button className={page === 'admin' ? 'active' : ''} onClick={() => setPage('admin')}>Admin</button>}
          <button onClick={() => openUserProfile(user.id)}>My Profile</button>
          <button onClick={handleLogout}>Log out</button>
        </div>
      </nav>

      {page === 'home' && <Home onSelectBusiness={openBusiness} goToReport={() => goToReport(null)} />}
      {page === 'directory' && <Directory onSelectBusiness={openBusiness} goToSubmit={goToSubmit} />}
      {page === 'report' && <ReportForm onDone={() => setPage('home')} prefill={reportPrefill} />}
      {page === 'submit' && <SubmitBusiness onDone={() => setPage('directory')} />}
      {page === 'admin' && <AdminDashboard />}
      {page === 'bizProfile' && selectedBusiness && (
        <BusinessPublicProfile
          business={selectedBusiness}
          onBack={() => setPage('home')}
          onReport={goToReport}
          currentUser={user}
        />
      )}
      {page === 'bizDashboard' && selectedBusiness && (
        <BusinessPrivateDashboard
          business={selectedBusiness}
          onBack={() => setPage('home')}
          currentUser={user}
        />
      )}
      {page === 'userProfile' && selectedUserId && (
        <UserProfile
          profileUserId={selectedUserId}
          currentUser={user}
          isAdmin={isAdmin}
          onBack={() => setPage('home')}
        />
      )}
    </div>
  )
}

export default App
