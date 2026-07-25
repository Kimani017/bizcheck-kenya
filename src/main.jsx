import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed:', err)
    })
  })
}
import PublicStorePage from './pages/PublicStorePage'

const storeMatch = window.location.pathname.match(/^\/store\/([^/]+)$/)
if (storeMatch) {
  createRoot(document.getElementById('root')).render(<PublicStorePage businessId={storeMatch[1]} />)
} else {
  // ...your existing app render code stays exactly as it is
}