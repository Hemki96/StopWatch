/**
 * Einstiegspunkt der App.
 *
 * Montiert React in `#root` und legt die Reihenfolge der äußeren Schichten fest:
 * `ErrorBoundary` fängt Render-Fehler aus allen Screens, `AppProvider` hält den
 * gesamten Zustand samt Persistenz, `App` ist der Navigationsrahmen. Der
 * Speicherschutz wird unabhängig vom Rendern einmalig angefragt.
 *
 * Es gibt hier keine Fachlogik: Alles Weitere gehört in `app/` oder `ui/`.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AppProvider } from './app/AppProvider'
import { ErrorBoundary } from './app/ErrorBoundary'
import { schuetzeSpeicherBeimStart } from './storage/persistenz'

const root = document.getElementById('root')
if (!root) throw new Error('Root-Element fehlt.')

// Reihenfolge bewusst außen nach innen: Ein Fehler im Provider soll noch die
// Fehlerseite zeigen, nicht eine leere Seite. `StrictMode` betrifft nur die
// Entwicklung; dort laufen Effekte doppelt, sie müssen also wiederholbar sein.
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
// Bewusst ohne `await`: Der Start der Oberfläche darf nicht auf die Antwort warten.
void schuetzeSpeicherBeimStart()
