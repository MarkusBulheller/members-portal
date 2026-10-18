import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyAccent, getStoredAccent } from './lib/accent.ts'
import { applyTheme, getStoredTheme } from './lib/theme.ts'

// Applied synchronously, before React ever renders, so a returning visitor doesn't see a flash
// of the defaults (dark theme, red accent) before their actual saved choice kicks in.
applyTheme(getStoredTheme())
applyAccent(getStoredAccent())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
