import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import Landing from './pages/Landing'
import Home from './pages/Home'
import Directory from './pages/Directory'
import { chargeUserCredits } from './pages/CreditGate'
import ReportForm from './pages/ReportForm'
import BusinessStorePage from './pages/BusinessStorePage'
import RubiksLoader from './pages/RubiksLoader'
import FeedTab from './pages/FeedTab'
import Icon from './pages/Icon'
import BusinessPrivateDashboard from './pages/BusinessPrivateDashboard'
import UserProfile from './pages/UserProfile'
import Auth from './pages/Auth'
import SubmitBusiness from './pages/SubmitBusiness'
import AdminDashboard from './pages/AdminDashboard'
import SetUsername from './pages/SetUsername'
import ResetPassword from './pages/ResetPassword'
import AdminProfiles from './pages/AdminProfiles'
import Pleads from './pages/Pleads'
import LoginOtp from './pages/LoginOtp'
import AdminIdCheck from './pages/AdminIdCheck'
import Messages from './pages/Messages'
import WalletPage from './pages/WalletPage'
import MyOrdersPage from './pages/MyOrdersPage'
import EditViaLink from './pages/EditViaLink'
import AccountChooser from './pages/AccountChooser'
import B2BChat from './pages/B2BChat'
import B2BOversight from './pages/B2BOversight'
import ReportTab from './pages/ReportTab'
import UserActivity from './pages/UserActivity'
import Notifications from './pages/Notifications'
import Pricing from './pages/Pricing'
import { PrivacyPolicy, TermsAndConditions } from './pages/Legal'
import { InsufficientCreditsModal } from './pages/AccessGate'
import AdminApplicationForm from './pages/AdminApplicationForm'
import EnterAdminCode from './pages/EnterAdminCode'
import Settings from './pages/Settings'
import Support from './pages/Support'
import './App.css'

const NAV_KEY = 'bizcheck_nav_state'
const BUSINESS_MODE_KEY = 'bizcheck_business_mode_id'
const NAV_IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

function App() {
  const [page, setPage] = useState('home')
  const [selectedBusiness, setSelectedBusiness] = useState(null)
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [reportPrefill, setReportPrefill] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [needsUsername, setNeedsUsername] = useState(false)
  const [recoveringPassword, setRecoveringPassword] = useState(false)
  const [pendingApplication, setPendingApplication] = useState(null)
  const [needsLoginOtp, setNeedsLoginOtp] = useState(false)
  const [needsAdminIdCheck, setNeedsAdminIdCheck] = useState(false)
  const [messageTargetId, setMessageTargetId] = useState(null)
  const [editLinkToken, setEditLinkToken] = useState(null)
  const [needsAccountChoice, setNeedsAccountChoice] = useState(false)
  const [ownedVerifiedBusinesses, setOwnedVerifiedBusinesses] = useState([])
  const [businessMode, setBusinessMode] = useState(null)
  const [b2bTargetBusiness, setB2bTargetBusiness] = useState(null)
  const [showCreditModal, setShowCreditModal] = useState(false)
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

    localStorage.setItem(NAV_KEY, JSON.stringify({ ...navState, savedAt: Date.now() }))
    const url = `#${newPage}`
    if (replace) window.history.replaceState(navState, '', url)
    else window.history.pushState(navState, '', url)
  }

  async function restoreNavState(navState) {
    if (!navState) return
    if (navState.page === 'auth') { setPage('home'); return }
    isRestoringRef.current = true
    try {
      if (navState.authMode) setAuthMode(navState.authMode)
      if (navState.businessId && ['bizStore', 'bizDashboard'].includes(navState.page)) {
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
        setUser(session?.user || null)
        setRecoveringPassword(true)
        return
      }

      if (event === 'SIGNED_OUT') {
        setUser(null)
        setIsAdmin(false)
        setNeedsUsername(false)
        setNeedsLoginOtp(false)
        setNeedsAdminIdCheck(false)
        localStorage.removeItem(NAV_KEY)
        sessionStorage.removeItem('bizcheck_admin_verified')
        localStorage.removeItem('bizcheck_account_choice')
        localStorage.removeItem(BUSINESS_MODE_KEY)
        setBusinessMode(null)
        return
      }

      if (event === 'SIGNED_IN') {
        const incomingUserId = session?.user?.id
        // ── KEY FIX ────────────────────────────────────────────────────────────
        // Supabase fires SIGNED_IN on EVERY token refresh, not just on a real
        // new login. File pickers, camera access, and tab focus all trigger a
        // token refresh which fires this event — causing the app to redirect to
        // home. We guard against this by only acting when the user ID actually
        // changes (i.e. a genuine new sign-in), ignoring refreshes for the same
        // already-logged-in user.
        setUser((prevUser) => {
          const isNewLogin = !prevUser || prevUser.id !== incomingUserId
          if (isNewLogin && session?.user) {
            supabase.from('profiles').select('is_banned').eq('id', session.user.id).single().then(({ data: banCheck }) => {
              if (banCheck?.is_banned) {
                alert('Your account has been banned from BizCheck Kenya for violating our community guidelines.')
                supabase.auth.signOut()
              }
            })
            checkUsername(session.user.id)
            setSelectedBusiness(null)
            setSelectedUserId(null)
            setPage('home')
            localStorage.setItem(NAV_KEY, JSON.stringify({ page: 'home', savedAt: Date.now() }))
            window.history.replaceState({ page: 'home' }, '', '#home')

            supabase.from('profiles').select('role').eq('id', session.user.id).single().then(({ data: profile }) => {
              const admin = !!profile && ['admin', 'superadmin'].includes(profile.role)
              setIsAdmin(admin)
              setIsSuperadmin(profile?.role === 'superadmin')
              const alreadyVerified = sessionStorage.getItem('bizcheck_admin_verified') === 'true'
              if (admin && !alreadyVerified) {
                setNeedsLoginOtp(true)
              } else if (!admin) {
                checkAccountChoice(session.user.id)
              }
            })
          }
          return session?.user || prevUser
        })
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
    const hash = window.location.hash
    if (hash.startsWith('#editlink-')) {
      setEditLinkToken(hash.replace('#editlink-', ''))
    }

    const { data } = await supabase.auth.getUser()
    const currentUser = data.user || null
    setUser(currentUser)
    if (currentUser) {
      const { data: profile } = await supabase.from('profiles').select('role, is_banned').eq('id', currentUser.id).single()
      if (profile?.is_banned) {
        alert('Your account has been banned from BizCheck Kenya for violating our community guidelines.')
        await supabase.auth.signOut()
        setCheckingAuth(false)
        return
      }
      await Promise.all([checkAdmin(currentUser.id), checkUsername(currentUser.id), checkPendingApplication(currentUser.id)])
      if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
        await checkAccountChoice(currentUser.id)
      }
    }
    setCheckingAuth(false)

    const saved = localStorage.getItem(NAV_KEY)
    if (saved) {
      try {
        const navState = JSON.parse(saved)
        const idleFor = Date.now() - (navState.savedAt || 0)
        if (idleFor > NAV_IDLE_TIMEOUT_MS) {
          localStorage.removeItem(NAV_KEY)
          setPage('home')
          window.history.replaceState({ page: 'home' }, '', '#home')
        } else {
          await restoreNavState(navState)
          window.history.replaceState(navState, '', `#${navState.page}`)
        }
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

  async function checkAccountChoice(userId) {
    const { data } = await supabase.from('businesses').select('*').eq('owner_id', userId).eq('status', 'verified').not('bizcode', 'is', null)
    setOwnedVerifiedBusinesses(data || [])
    const alreadyChosen = localStorage.getItem('bizcheck_account_choice') === 'true'

    if (alreadyChosen) {
      const savedBusinessId = localStorage.getItem(BUSINESS_MODE_KEY)
      if (savedBusinessId) {
        const restoredBiz = (data || []).find((b) => b.id === savedBusinessId)
        if (restoredBiz) setBusinessMode(restoredBiz)
      }
      return
    }

    if (data && data.length > 0) {
      setNeedsAccountChoice(true)
    }
  }

  async function checkAdmin(userId) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single()
    setIsAdmin(!!profile && ['admin', 'superadmin'].includes(profile.role))
    setIsSuperadmin(!!profile && profile.role === 'superadmin')
  }

  async function openBusiness(business) {
    supabase.from('profile_views').insert({
      business_id: business.id,
      viewer_id: user?.id || null,
      view_type: 'card_click',
    })

    const isOwnBusiness = user && business.owner_id === user.id

    if (user && !businessMode && !isAdmin && !isOwnBusiness) {
      const result = await chargeUserCredits('view_business_profile', 1)
      if (!result.ok) {
        if (result.insufficientCredits) { setShowCreditModal(true); return }
        alert('Error: ' + result.error)
        return
      }
    }

    if (isOwnBusiness) {
      navigate('bizDashboard', { business })
    } else {
      navigate('bizStore', { business })
    }
  }

  function openUserProfile(userId) {
    navigate('userProfile', { userId: userId || user?.id })
  }

  function openMessages(targetUserId = null) {
    setMessageTargetId(targetUserId)
    navigate('messages')
  }

  function openB2BChat(targetBusiness = null) {
    setB2bTargetBusiness(targetBusiness)
    navigate('directory')
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
    localStorage.removeItem(NAV_KEY)
    navigate('home', { business: null, userId: null })
  }

  if (checkingAuth || restoring) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
        <RubiksLoader label="Loading BizCheck…" />
      </div>
    )
  }

  if (recoveringPassword) {
    return <ResetPassword onDone={() => { setRecoveringPassword(false); navigate('home') }} />
  }

  if (editLinkToken && user) {
    return (
      <EditViaLink
        token={editLinkToken}
        currentUser={user}
        onDone={() => { setEditLinkToken(null); window.history.replaceState({}, '', '#home'); navigate('home') }}
      />
    )
  }

  if (user && needsLoginOtp) {
    return <LoginOtp currentUser={user} onVerified={() => { setNeedsLoginOtp(false); setNeedsAdminIdCheck(true) }} />
  }

  if (user && needsAdminIdCheck) {
    return <AdminIdCheck onVerified={() => {
      setNeedsAdminIdCheck(false)
      sessionStorage.setItem('bizcheck_admin_verified', 'true')
    }} />
  }

  if (user && needsUsername) {
    return <SetUsername user={user} onDone={() => setNeedsUsername(false)} />
  }

  if (user && needsAccountChoice) {
    return (
      <AccountChooser
        businesses={ownedVerifiedBusinesses}
        currentUser={user}
        onChoosePersonal={() => { localStorage.setItem('bizcheck_account_choice', 'true'); localStorage.removeItem(BUSINESS_MODE_KEY); setNeedsAccountChoice(false) }}
        onChooseBusiness={(biz) => {
          localStorage.setItem('bizcheck_account_choice', 'true')
          localStorage.setItem(BUSINESS_MODE_KEY, biz.id)
          setBusinessMode(biz)
          setNeedsAccountChoice(false)
          setSelectedBusiness(biz)
          navigate('bizDashboard', { business: biz })
        }}
      />
    )
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
        {page === 'privacy' ? <PrivacyPolicy onBack={() => navigate('home')} />
          : page === 'terms' ? <TermsAndConditions onBack={() => navigate('home')} />
          : page === 'auth' ? <Auth onAuthed={() => navigate('home')} initialMode={authMode} />
          : <Landing goToAuth={goToAuth} />}
        <div style={{ textAlign: 'center', padding: '18px 0 26px', fontSize: 12 }}>
          <button className="link-btn" style={{ margin: '0 10px', fontSize: 12 }} onClick={() => navigate('privacy')}>Privacy Policy</button>
          <button className="link-btn" style={{ margin: '0 10px', fontSize: 12 }} onClick={() => navigate('terms')}>Terms &amp; Conditions</button>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {!isMobileView ? (
        <nav className="navbar navbar-grid">
          <div className="logo" onClick={() => navigate('home')}>
            <span className="logo-dot"></span> BizCheck Kenya
          </div>

          <div className="nav-links nav-links-center">
            <button className={page === 'home' ? 'active' : ''} onClick={() => navigate('home')}>Home</button>
            <button className={page === 'feed' ? 'active' : ''} onClick={() => navigate('feed')}>Feed</button>
            <button className={page === 'directory' ? 'active' : ''} onClick={() => navigate('directory')}>Market</button>
            {isSuperadmin ? (
              <button className={page === 'b2bOversight' ? 'active' : ''} onClick={() => navigate('b2bOversight')}>B2B</button>
            ) : isAdmin ? (
              <button className={page === 'userActivity' ? 'active' : ''} onClick={() => navigate('userActivity')}>User Activity</button>
            ) : (
              <button className={page === 'report' ? 'active' : ''} onClick={() => goToReport(null)}>{businessMode ? 'Report' : 'Report a Scammer'}</button>
            )}
            {isAdmin && <button className={page === 'admin' ? 'active' : ''} onClick={() => navigate('admin')}>Admin</button>}
            {businessMode ? (
              <button className={page === 'bizDashboard' ? 'active' : ''} onClick={() => { setSelectedBusiness(businessMode); navigate('bizDashboard', { business: businessMode }) }}>🏢 {businessMode.name}</button>
            ) : isAdmin ? (
              <button className={page === 'adminProfiles' ? 'active' : ''} onClick={() => navigate('adminProfiles')}>Profiles</button>
            ) : (
              <button className={page === 'userProfile' ? 'active' : ''} onClick={() => openUserProfile(user.id)}>My Profile</button>
            )}
            <button className={page === 'messages' ? 'active' : ''} onClick={() => openMessages()}>Messages</button>
            <button className={page === 'notifications' ? 'active' : ''} onClick={() => navigate('notifications')} aria-label="Notifications"><Icon.Bell size={19} /></button>
          </div>

          <div className="nav-links nav-links-right">
            <button className={page === 'wallet' ? 'active' : ''} onClick={() => navigate('wallet')}>Wallet</button>
            <button className={page === 'myOrders' ? 'active' : ''} onClick={() => navigate('myOrders')}>My Orders</button>
            <button className={page === 'settings' ? 'active' : ''} onClick={() => navigate('settings')}>Settings</button>
            {isSuperadmin && <button className={page === 'pleads' ? 'active' : ''} onClick={() => navigate('pleads')}>Pleads</button>}
          </div>
        </nav>
      ) : (
        <>
          <div className="mobile-topbar">
            <button className="hamburger-btn" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu"><Icon.Menu size={22} /></button>
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
              <button className={page === 'feed' ? 'active' : ''} onClick={() => navigate('feed')}>Feed</button>
              <button className={page === 'directory' ? 'active' : ''} onClick={() => navigate('directory')}>Market</button>
              {isSuperadmin ? (
                <button className={page === 'b2bOversight' ? 'active' : ''} onClick={() => navigate('b2bOversight')}>B2B</button>
              ) : isAdmin ? (
                <button className={page === 'userActivity' ? 'active' : ''} onClick={() => navigate('userActivity')}>User Activity</button>
              ) : (
                <button className={page === 'report' ? 'active' : ''} onClick={() => goToReport(null)}>{businessMode ? 'Report' : 'Report a Scammer'}</button>
              )}
              {isAdmin && <button className={page === 'admin' ? 'active' : ''} onClick={() => navigate('admin')}>Admin</button>}
              {businessMode ? (
                <button className={page === 'bizDashboard' ? 'active' : ''} onClick={() => { setSelectedBusiness(businessMode); navigate('bizDashboard', { business: businessMode }) }}>🏢 {businessMode.name}</button>
              ) : isAdmin ? (
                <button className={page === 'adminProfiles' ? 'active' : ''} onClick={() => navigate('adminProfiles')}>Profiles</button>
              ) : (
                <button className={page === 'userProfile' ? 'active' : ''} onClick={() => openUserProfile(user.id)}>My Profile</button>
              )}
              <button className={page === 'messages' ? 'active' : ''} onClick={() => openMessages()}>Messages</button>
              <button className={page === 'wallet' ? 'active' : ''} onClick={() => navigate('wallet')}>Wallet</button>
              <button className={page === 'myOrders' ? 'active' : ''} onClick={() => navigate('myOrders')}>My Orders</button>
              <button className={page === 'notifications' ? 'active' : ''} onClick={() => navigate('notifications')} aria-label="Notifications"><Icon.Bell size={19} /></button>
              <div className="mobile-menu-divider" />
              <button className={page === 'settings' ? 'active' : ''} onClick={() => navigate('settings')}>Settings</button>
              {isSuperadmin && <button className={page === 'pleads' ? 'active' : ''} onClick={() => navigate('pleads')}>Pleads</button>}
            </div>
          </div>

          <nav className="bottom-nav">
            <button className={page === 'home' ? 'active' : ''} onClick={() => navigate('home')}>
              <Icon.Home size={21} /><label>Home</label>
            </button>
            <button className={page === 'feed' ? 'active' : ''} onClick={() => navigate('feed')}>
              <Icon.Feed size={21} /><label>Feed</label>
            </button>
            <button className={page === 'directory' ? 'active' : ''} onClick={() => navigate('directory')}>
              <Icon.Market size={21} /><label>Market</label>
            </button>
            <button className={page === 'report' ? 'active' : ''} onClick={() => goToReport(null)}>
              <Icon.Report size={21} /><label>Report</label>
            </button>
            <button className={page === 'messages' ? 'active' : ''} onClick={() => openMessages()}>
              <Icon.Messages size={21} /><label>Messages</label>
            </button>
            {businessMode ? (
              <button className={page === 'bizDashboard' ? 'active' : ''} onClick={() => { setSelectedBusiness(businessMode); navigate('bizDashboard', { business: businessMode }) }}>
                <Icon.Business size={21} /><label>Business</label>
              </button>
            ) : (
              <button className={page === 'userProfile' ? 'active' : ''} onClick={() => openUserProfile(user.id)}>
                <Icon.Profile size={21} /><label>Profile</label>
              </button>
            )}
          </nav>
        </>
      )}

      <div className="main-content">
        {page === 'home' && <Home onSelectBusiness={openBusiness} goToReport={() => goToReport(null)} currentUser={user} />}
        {page === 'feed' && <FeedTab onSelectBusiness={openBusiness} currentUser={user} />}
        {page === 'directory' && <Directory onSelectBusiness={openBusiness} goToSubmit={goToSubmit} businessMode={businessMode} currentUser={user} initialMarketSubtab={b2bTargetBusiness ? 'b2b' : 'browse'} initialB2BTarget={b2bTargetBusiness} onInsufficientCredits={() => setShowCreditModal(true)} />}
        {page === 'report' && (
          businessMode
            ? <ReportTab currentUser={user} businessMode={businessMode} onMessageUser={openMessages} onDone={() => navigate('home')} onInsufficientCredits={() => setShowCreditModal(true)} />
            : <ReportForm currentUser={user} onDone={() => navigate('home')} prefill={reportPrefill} />
        )}
        {page === 'userActivity' && isAdmin && <UserActivity onBack={null} />}
        {page === 'notifications' && (
          <Notifications
            currentUser={user}
            businessMode={businessMode}
            onBack={goBack}
            onOpenMessages={() => openMessages()}
            onOpenB2B={() => openB2BChat()}
          />
        )}
        {page === 'pricing' && <Pricing currentUser={user} businessMode={businessMode} onBack={goBack} />}
        {page === 'privacy' && <PrivacyPolicy onBack={goBack} />}
        {page === 'terms' && <TermsAndConditions onBack={goBack} />}
        {page === 'submit' && <SubmitBusiness currentUser={user} onDone={() => navigate('directory')} />}
        {page === 'admin' && <AdminDashboard onSelectBusiness={openBusiness} onSelectUser={openUserProfile} />}
        {page === 'adminProfiles' && <AdminProfiles onSelectBusiness={openBusiness} onSelectUser={openUserProfile} currentUser={user} />}
        {page === 'settings' && <Settings theme={theme} toggleTheme={toggleTheme} onBack={goBack} onLogout={handleLogout} onOpenSupport={() => navigate('support')} onOpenPricing={() => navigate('pricing')} onOpenPrivacy={() => navigate('privacy')} onOpenTerms={() => navigate('terms')} businessMode={businessMode} onSwitchToPersonal={() => { localStorage.removeItem(BUSINESS_MODE_KEY); setBusinessMode(null); navigate('home') }} />}
        {page === 'wallet' && <WalletPage currentUser={user} onBack={goBack} />}
        {page === 'myOrders' && <MyOrdersPage currentUser={user} onBack={goBack} onSelectBusiness={openBusiness} />}
        {page === 'support' && <Support onBack={goBack} currentUser={user} businessMode={businessMode} onInsufficientCredits={() => setShowCreditModal(true)} />}
        {page === 'pleads' && <Pleads onBack={goBack} onSelectBusiness={openBusiness} />}
        {page === 'messages' && <Messages currentUser={user} initialTargetId={messageTargetId} isAdmin={isAdmin} businessMode={businessMode} onBack={goBack} onInsufficientCredits={() => setShowCreditModal(true)} onMessageBusiness={openB2BChat} />}
        {page === 'b2bOversight' && isSuperadmin && <B2BOversight onBack={goBack} />}
        {page === 'bizStore' && selectedBusiness && (
          <BusinessStorePage
            business={selectedBusiness}
            onBack={goBack}
            onReport={goToReport}
            currentUser={user}
            isAdmin={isAdmin}
            businessMode={businessMode}
            onMessageBusiness={openB2BChat}
            onMessageUser={openMessages}
            onInsufficientCredits={() => setShowCreditModal(true)}
          />
        )}
        {page === 'bizDashboard' && selectedBusiness && (
          <BusinessPrivateDashboard
            business={selectedBusiness}
            onBack={goBack}
            currentUser={user}
            onInsufficientCredits={() => setShowCreditModal(true)}
            onOpenPricing={() => navigate('pricing')} onOpenPrivacy={() => navigate('privacy')} onOpenTerms={() => navigate('terms')}
          />
        )}
        {page === 'userProfile' && selectedUserId && (
          <UserProfile
            profileUserId={selectedUserId}
            currentUser={user}
            isAdmin={isAdmin}
            onBack={goBack}
            onSelectBusiness={openBusiness}
            onMessage={openMessages}
          />
        )}
      </div>

      {showCreditModal && (
        <InsufficientCreditsModal
          isBusiness={!!businessMode}
          onClose={() => setShowCreditModal(false)}
          onGoToPricing={() => { setShowCreditModal(false); navigate('pricing') }}
        />
      )}
    </div>
  )
}

export default App
