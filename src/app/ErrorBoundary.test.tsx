/**
 * Fehlergrenze gegen die weiße Seite.
 *
 * Ein Renderfehler in einem Screen darf die App nicht unsichtbar machen: Die
 * `ErrorBoundary` zeigt stattdessen eine Meldung mit „Neu laden“ und markiert
 * sie als `role="alert"`, damit Screenreader sie vorlesen. Der Test prüft
 * genau diesen Ausweichpfad; die eigentliche Fehlerursache wird nicht bewertet.
 *
 * Testhilfe: Statt des `render`-Helfers wird hier ein eigener Root verwendet,
 * weil der fehlwerfende Baum beim Rendern eine React-Fehlergrenze auslöst.
 * `console.error` ist stillgelegt, da React den gefangenen Fehler zusätzlich
 * protokolliert.
 */
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

let container: HTMLDivElement
let root: Root

// Eigener Container und Root pro Test, damit kein DOM aus dem Vorfall bleibt.
beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

/** Fixture: wirft beim Rendern und löst damit die Fehlergrenze aus. */
function Wirft(): never {
  throw new Error('Testfehler')
}

// Prüft den Ausweichzustand der Fehlergrenze.
describe('ErrorBoundary', () => {
  it('zeigt statt der weißen Seite eine Meldung mit Neuladen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    act(() => {
      root.render(
        <ErrorBoundary>
          <Wirft />
        </ErrorBoundary>,
      )
    })

    expect(container.textContent).toContain('Etwas ist schiefgelaufen')
    expect(container.textContent).toContain('Neu laden')
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
  })
})
