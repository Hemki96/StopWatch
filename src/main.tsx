import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AppProvider } from './app/AppProvider'
import { ErrorBoundary } from './app/ErrorBoundary'
import { schuetzeSpeicherBeimStart } from './storage/persistenz'

const root = document.getElementById('root')
if (!root) throw new Error('Root-Element fehlt.')

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProvider>
        <App />
      </AppProvider>
    </ErrorBoundary>
  </StrictMode>,
)

// Einmalig anfragen, damit der Browser die Läufe nicht bei Platzmangel verwirft.
void schuetzeSpeicherBeimStart()
