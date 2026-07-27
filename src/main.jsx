import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import PublicStorePage from './pages/PublicStorePage'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed:', err)
    })
  })
}

const storeMatch = window.location.pathname.match(/^\/store\/([^/]+)$/)

if (storeMatch) {
  // QR code / direct storefront link — render ONLY the public store page.
  // Skips App entirely, so no auth check, no Supabase session logic runs
  // for someone who just scanned a code and isn't logging in.
  createRoot(document.getElementById('root')).render(
    <PublicStorePage businessId={storeMatch[1]} />
  )
} else {
  // Normal app load
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
