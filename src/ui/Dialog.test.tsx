/**
 * Gemeinsame Dialog-Hülle: Fokusfalle, Fokus-Rückgabe, Escape und Scroll-Sperre.
 *
 * Die Datei sichert die Accessibility-Verträge ab, auf die sich `Sheet` und
 * `Bestaetigung` verlassen: Tab und Shift+Tab laufen am Panel-Rand wieder auf
 * die andere Seite, der Fokus kehrt zum Auslöser zurück, Escape schließt nur
 * den obersten gestapelten Dialog, und die Seite scrollt nicht hinter dem
 * Dialog. Diese Fälle sind leicht zu brechen, weil der Stapel und der
 * Scroll-Zähler Modulzustand sind.
 *
 * Testhilfen: Eigener Root pro Test statt `render`, weil hier bewusst mehrere
 * Dialoge in einem Container gestapelt werden. `taste` sendet ein
 * `keydown`-Ereignis mit `bubbles`, damit der Capture-Listener auf `document`
 * es sicher empfängt.
 */
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Bestaetigung } from './Bestaetigung'
import { Sheet } from './Sheet'

let container: HTMLDivElement
let root: Root

// Frischer Root pro Test; der Dialogstapel wird über die Unmounts im
// `afterEach` wieder geleert.
beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  history.replaceState(null, '')
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
})

/** Sendet eine Tastatureingabe an `document`; `shiftKey` steuert die Richtung. */
function taste(key: string, shiftKey = false) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }))
  })
}

// Verhalten der Dialog-Hülle selbst, unabhängig vom konkreten Inhalt.
describe('Dialog', () => {
  // Tab am letzten Element springt auf das erste, Shift+Tab am ersten auf das
  // letzte. So kann der Fokus die Seite dahinter nicht erreichen.
  it('hält den Fokus mit Tab und Shift+Tab im Dialog', () => {
    act(() => {
      root.render(
        <Sheet open titel="Test" onClose={() => undefined}>
          <button type="button">Erster</button>
          <button type="button">Letzter</button>
        </Sheet>,
      )
    })

    const panel = container.querySelector('[role="dialog"]')!
    const buttons = [...panel.querySelectorAll('button')]
    const letzter = buttons.at(-1)!
    const erster = buttons[0]!

    letzter.focus()
    taste('Tab')
    expect(document.activeElement).toBe(erster)

    erster.focus()
    taste('Tab', true)
    expect(document.activeElement).toBe(letzter)
  })

  // Zwei Dialoge können gleichzeitig schließen (etwa Bestätigung und Detail).
  // Der eine angelegte History-Eintrag darf nur einmal zurückgehen; sonst
  // landet die App hinter ihrem Einstiegspunkt auf about:blank.
  it('geht beim gleichzeitigen Schließen zweier Dialoge nur einmal zurück', async () => {
    const zurueck = vi.spyOn(history, 'back').mockImplementation(() => undefined)

    act(() => {
      root.render(
        <>
          <Sheet open titel="Detail" onClose={() => undefined}>
            <button type="button">Detail</button>
          </Sheet>
          <Bestaetigung
            open
            titel="Löschen?"
            text="Wirklich?"
            bestaetigenLabel="Löschen"
            onBestaetigen={() => undefined}
            onAbbrechen={() => undefined}
          />
        </>,
      )
    })
    expect(history.state).toMatchObject({ beckenrandDialog: true })

    act(() => root.render(<></>))
    await act(async () => {
      await Promise.resolve()
    })

    expect(zurueck).toHaveBeenCalledTimes(1)
  })

  // Beim Öffnen wandert der Fokus ins Panel, beim Schließen zurück zum
  // Auslöser. Ohne diese Rückgabe landet die Tastaturbedienung wieder am
  // Seitenanfang.
  it('gibt beim Schließen den Fokus an den Auslöser zurück', () => {
    const ausloeser = document.createElement('button')
    ausloeser.textContent = 'Öffnen'
    document.body.append(ausloeser)
    ausloeser.focus()

    act(() => {
      root.render(
        <Sheet open titel="Test" onClose={() => undefined}>
          <button type="button">Im Dialog</button>
        </Sheet>,
      )
    })

    // Der Auslöser war vor dem Öffnen fokussiert.
    expect(document.activeElement).not.toBe(ausloeser)
    act(() => {
      root.render(
        <Sheet open={false} titel="Test" onClose={() => undefined}>
          <button type="button">Im Dialog</button>
        </Sheet>,
      )
    })
    expect(document.activeElement).toBe(ausloeser)
    ausloeser.remove()
  })

  // Stapel: Liegt eine Bestätigung über einem Sheet, darf Escape nur die
  // Bestätigung abbrechen. Sonst würden zwei Dialoge gleichzeitig verschwinden.
  it('schließt mit Escape nur den obersten Dialog', () => {
    const sheetSchliessen = vi.fn()
    const bestaetigungAbbrechen = vi.fn()

    act(() => {
      root.render(
        <>
          <Sheet open titel="Sheet" onClose={sheetSchliessen}>
            <p>Inhalt</p>
          </Sheet>
          <Bestaetigung
            open
            titel="Sicher?"
            text="Wirklich?"
            bestaetigenLabel="Ja"
            onBestaetigen={() => undefined}
            onAbbrechen={bestaetigungAbbrechen}
          />
        </>,
      )
    })

    taste('Escape')
    expect(bestaetigungAbbrechen).toHaveBeenCalledTimes(1)
    expect(sheetSchliessen).not.toHaveBeenCalled()
  })

  // Scroll-Sperre per Referenzzähler: Beide Elemente werden gesperrt, damit
  // iOS-Safari nicht die Seite hinter dem Sheet mitscrollt.
  it('sperrt das Scrollen der Seite, solange ein Dialog offen ist', () => {
    act(() => {
      root.render(
        <Sheet open titel="Test" onClose={() => undefined}>
          <p>Inhalt</p>
        </Sheet>,
      )
    })
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.documentElement.style.overflow).toBe('hidden')
  })
})
