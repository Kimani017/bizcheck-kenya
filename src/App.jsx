import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import Home from './pages/Home'
import Directory from './pages/Directory'
import ReportForm from './pages/ReportForm'
import BusinessDetail from './pages/BusinessDetail'
import Auth from './pages/Auth'
import SubmitBusiness from './pages/SubmitBusiness'
import AdminDashboard from './pages/AdminDashboard'
import './App.css'

function App() {
  const [page, setPage] = useState('home')
  const [selectedBusiness, setSelectedBusiness] = useState(null)
  const [reportPrefill, setReportPrefill] = useState(null)
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

  const openBusiness = (business) => {
    setSelectedBusiness(business)
    setPage('detail')
  }

  // Called from BusinessDetail with the business object
  // or from navbar/home with no business (blank form)
  function goToReport(business = null) {
    setReportPrefill(business)
    setPage('report')
  }

  function goToSubmit() {
    if (!user) {
      alert('Please log in first to list a business.')
      setPage('auth')
      return
    }
    setPage('submit')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setPage('home')
  }

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
          {isAdmin && (
            <button className={page === 'admin' ? 'active' : ''} onClick={() => setPage('admin')}>Admin</button>
          )}
          {!checkingAuth && (
            user ? (
              <button onClick={handleLogout}>Log out</button>
            ) : (
              <button className={page === 'auth' ? 'active' : ''} onClick={() => setPage('auth')}>Log in</button>
            )
          )}
        </div>
      </nav>

      {page === 'home' && <Home onSelectBusiness={openBusiness} goToReport={() => goToReport(null)} />}
      {page === 'directory' && <Directory onSelectBusiness={openBusiness} goToSubmit={goToSubmit} />}
      {page === 'report' && <ReportForm onDone={() => setPage('home')} prefill={reportPrefill} />}
      {page === 'auth' && <Auth onAuthed={() => setPage('home')} />}
      {page === 'submit' && <SubmitBusiness onDone={() => setPage('directory')} />}
      {page === 'admin' && <AdminDashboard />}
      {page === 'detail' && selectedBusiness && (
        <BusinessDetail
          business={selectedBusiness}
          onBack={() => setPage('home')}
          onReport={goToReport}
        />
      )}
    </div>
  )
}

export default App
