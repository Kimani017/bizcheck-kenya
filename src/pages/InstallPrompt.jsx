import { useState, useEffect } from 'react'

// Captures the browser's native install prompt (Chrome/Edge on
// Android + desktop) so we can trigger it from our own button.
// Safari (iOS) never fires this event — it always requires the
// manual Share -> Add to Home Screen flow, so we show instructions
// there instead.
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installed, setInstalled] = useState(false)
  const [showIosHelp, setShowIosHelp] = useState(false)

  useEffect(() => {
    // Already running as an installed app? Don't show anything.
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
      return
    }

    function handlePrompt(e) {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handlePrompt)

    function handleInstalled() {
      setInstalled(true)
      setDeferredPrompt(null)
    }
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  async function handleInstallClick() {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    if (isIos) { setShowIosHelp(true); return }

    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
  }

  if (installed) return null

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
  if (!deferredPrompt && !isIos) return null // nothing to offer yet on this browser

  return (
    <>
      <button
        onClick={handleInstallClick}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 16px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
      >
        📲 Install BizCheck app
      </button>

      {showIosHelp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setShowIosHelp(false)}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 26, maxWidth: 340, width: '100%', border: '1px solid var(--border)', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📲</div>
            <h3 style={{ marginBottom: 10, color: 'var(--text-strong)' }}>Install on iPhone</h3>
            <p style={{ fontSize: 14, color: 'var(--text)', marginBottom: 6 }}>1. Tap the <strong>Share</strong> button (square with an arrow) at the bottom of Safari</p>
            <p style={{ fontSize: 14, color: 'var(--text)', marginBottom: 16 }}>2. Scroll down and tap <strong>"Add to Home Screen"</strong></p>
            <button className="btn-primary" onClick={() => setShowIosHelp(false)}>Got it</button>
          </div>
        </div>
      )}
    </>
  )
}
