/**
 * Lauf-Detail als echter Dialog: Startfokus, Fokusfalle und Fokus-Rückgabe.
 *
 * Das Detail wird aus dem Verlauf geöffnet und muss denselben Fokusvertrag wie
 * Sheets und Bestätigungen erfüllen: Beim Öffnen liegt der Fokus im Detail, Tab
 * verlässt das Panel nicht, Escape schließt zuerst eine darüberliegende
 * Bestätigung und danach das Detail, und der Fokus kehrt zur auslösenden Zeile
 * zurück. Ohne diese Fälle bliebe der zentrale Verlaufseinstieg faktisch
 * maus-/touch-only.
 *
 * Testhilfen: `fake-indexeddb` liefert einen echten Bestand im Speicher, der
 * `AppProvider` erzeugt den Lauf über seine normalen Aktionen, und `HistoryScreen`
 * ist der reale Einstieg in das Detail. Der Klick auf die Zeile wird von einem
 * manuellen `focus()` begleitet, weil jsdom beim programmatischen `click()`
 * keinen Fokus setzt — der Browser tut das sehr wohl.
 */
// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProvider, useApp, type AppContextValue } from '../app/AppProvider'
import { clearAll } from '../storage/repository'
import { render, warteAuf, type RenderErgebnis } from '../test/render'
import { HistoryScreen } from './HistoryScreen'

/** Standardlauf: 100 m in einem 50-m-Becken, also zwei Längen. */
const K100 = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

const offeneApps: RenderErgebnis[] = []

/**
 * Baut App-Provider und Verlauf auf und wartet auf den ersten Ladevorgang.
 * Die Sonde reicht den Kontextwert nach außen, damit der Test den Lauf über
 * dieselben Aktionen anlegen kann wie die App.
 */
async function starteVerlauf() {
  let aktuell: AppContextValue | null = null

  function Probe() {
    aktuell = useApp()
    return null
  }

  const ergebnis = render(
    <AppProvider>
      <Probe />
      <HistoryScreen />
    </AppProvider>,
  )
  offeneApps.push(ergebnis)

  await warteAuf(() => aktuell?.geladen === true)

  const app = () => {
    if (!aktuell) throw new Error('AppProvider ist noch nicht bereit.')
    return aktuell
  }

  return { ...ergebnis, app }
}

beforeEach(async () => {
  // Ohne BroadcastChannel ist genau dieser Tab aktiv; clearAll verhindert,
  // dass Bestand aus einem vorherigen Test sichtbar bleibt.
  vi.stubGlobal('BroadcastChannel', undefined)
  localStorage.clear()
  await clearAll()
})

afterEach(() => {
  for (const app of offeneApps.splice(0)) app.unmount()
  vi.unstubAllGlobals()
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
})

/** Sendet eine Tastatureingabe an `document`; `shiftKey` steuert die Richtung. */
function taste(key: string, shiftKey = false) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }))
  })
}

/** Legt einen gestarteten Lauf mit zwei Bahnen an und gibt seine Id zurück. */
function legeLaufAn(app: () => AppContextValue): string {
  let laufId = ''
  act(() => {
    laufId = app().neuerLauf(K100, 2) ?? ''
  })
  act(() => app().startAlle(1_000, 1_700_000_000_000))

  const bahn = app().laeufe.find((lauf) => lauf.id === laufId)!.bahnen[0]!
  act(() => {
    app().tippe(bahn.id, 31_000, 1_700_000_030_000)
    app().tippe(bahn.id, 61_000, 1_700_000_060_000)
  })

  return laufId
}

/** Findet die Verlaufszeile über ihre sichtbare Kurzbeschreibung. */
function zeileFuer(container: HTMLElement): HTMLButtonElement {
  const zeile = [...container.querySelectorAll('button')].find((knopf) =>
    knopf.textContent?.includes('2 Bahnen · 100 m'),
  )
  if (!zeile) throw new Error('Verlaufszeile nicht gefunden.')
  return zeile as HTMLButtonElement
}

describe('LaufDetail', () => {
  it('öffnet als Dialog mit Startfokus und hält Tab im Detail', async () => {
    const { container, app } = await starteVerlauf()
    legeLaufAn(app)

    const zeile = zeileFuer(container)
    act(() => {
      zeile.focus()
      zeile.click()
    })
    // Das Detail kommt als eigener Chunk; der Test wartet auf die Dialoggrenze,
    // statt die Ladezeit als Teil des Fokusvertrags zu prüfen.
    await warteAuf(() => container.querySelector('[role="dialog"]') !== null)

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')
    expect(dialog).not.toBeNull()
    // Der Dialog beschreibt sich selbst und ist für Screenreader modal.
    expect(dialog!.getAttribute('aria-modal')).toBe('true')
    const labelledBy = dialog!.getAttribute('aria-labelledby')!
    expect(document.getElementById(labelledBy)?.textContent).toContain('2 Bahnen · 100 m')

    // Startfokus liegt auf dem Rückweg, nicht auf der verdeckten Listenzeile.
    const zurueck = dialog!.querySelector<HTMLElement>('button[aria-label="Zurück zum Verlauf"]')
    expect(document.activeElement).toBe(zurueck)

    // Tab und Shift+Tab laufen zwischen erstem und letztem Element des Panels.
    const fokussierbar = [
      ...dialog!.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ]
    const erstes = fokussierbar[0]!
    const letztes = fokussierbar.at(-1)!
    expect(erstes).toBe(zurueck)

    letztes.focus()
    taste('Tab')
    expect(document.activeElement).toBe(erstes)

    erstes.focus()
    taste('Tab', true)
    expect(document.activeElement).toBe(letztes)
  })

  it('schließt mit Escape nur den obersten Dialog und gibt den Fokus zurück', async () => {
    const { container, app } = await starteVerlauf()
    legeLaufAn(app)

    const zeile = zeileFuer(container)
    act(() => {
      zeile.focus()
      zeile.click()
    })
    await warteAuf(() => container.querySelector('[role="dialog"]') !== null)

    // Über dem Detail liegt die Löschbestätigung; Escape darf nur sie schließen.
    const loeschen = container.querySelector<HTMLElement>('button[aria-label="Lauf löschen"]')!
    act(() => loeschen.click())
    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull()

    taste('Escape')
    expect(container.querySelector('[role="alertdialog"]')).toBeNull()
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()

    // Das zweite Escape schließt das Detail und gibt den Fokus an die Zeile zurück.
    taste('Escape')
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(zeile)
  })
})
