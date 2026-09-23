import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

if (new URLSearchParams(window.location.search).get('layoutStudio') === '1' && window.parent !== window) {
  void import('./studio/previewBridge').then(({ startPreviewBridge }) => startPreviewBridge())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
