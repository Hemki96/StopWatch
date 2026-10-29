/**
 * PWA-Schicht: Service Worker, Online-Status und Installation.
 *
 * Die Tests sichern die Browser-Randfälle ab, nicht Fachlogik: Der Service
 * Worker wird pro Seitenaufruf genau einmal registriert, Updates werden nur
 * gemeldet und erst auf Wunsch eingespielt, beim Zurückkehren in den
 * Vordergrund wird aktiv nach einer neuen Version gesucht, und ohne
 * Unterstützung bleibt alles still statt zu werfen. Bei der Installation geht
 * es um den einmalig verbrauchten Prompt, die Erkennung von standalone/iOS und
 * das Aufräumen der Listener.
 *
 * Testhilfen: `virtual:pwa-register` ist über `vi.hoisted` gemockt, weil
 * `vi.mock` über die Imports gehoben wird. `navigator.serviceWorker` und
 * `matchMedia` werden pro Test als minimale Attrappen gesetzt; `vi.resetModules`
 * ist nötig, weil `pwa.ts` den Registrierungszustand im Modul hält und sonst
 * zwischen den Tests „schon registriert“ wäre.
 */
// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, warteAuf } from '../test/render'
import { useInstallPrompt, useOnlineStatus } from './pwa'

// `vi.mock` wird vor die Imports gehoben; die Mock-Funktion muss deshalb
// ebenfalls hoisted sein, sonst ist sie im Mock noch nicht definiert.
const mocks = vi.hoisted(() => ({
  registerSW: vi.fn(),
}))

vi.mock('virtual:pwa-register', () => ({
  registerSW: mocks.registerSW,
}))

/** Minimale Form der Service-Worker-Registrierung, die der Hook nachlädt. */
interface RegistrierungMock {
  update: ReturnType<typeof vi.fn>
  waiting?: ServiceWorker | null
}

/**
 * Setzt `navigator.serviceWorker` mit einer Registrierung, deren `update`
 * beobachtet werden kann. `configurable` erlaubt das Entfernen im `afterEach`.
 */
function setzeServiceWorker(update: () => Promise<void> = async () => undefined) {
  const registrierung: RegistrierungMock = { update: vi.fn(update) }
  const serviceWorker = {
    getRegistration: vi.fn(async () => registrierung),
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    value: serviceWorker,
    configurable: true,
  })
  return { serviceWorker, registrierung }
}

/** Simuliert einen Browser ohne Service-Worker-Unterstützung. */
function entferneServiceWorker() {
  Reflect.deleteProperty(navigator, 'serviceWorker')
}

/**
 * Ersetzt `matchMedia` durch eine steuerbare Abfrage. Nur
 * `(display-mode: standalone)` wird ausgewertet; die Zuhörer-Menge erlaubt es,
 * einen Wechsel der Anzeigeart auszulösen und das Aufräumen zu prüfen.
 */
function stelleMatchMedia() {
  let stehtAllein = false
  const zuhoerer = new Set<() => void>()
  const abfrage = (query: string) => ({
    matches: query === '(display-mode: standalone)' ? stehtAllein : false,
    media: query,
    addEventListener: (_: string, cb: () => void) => zuhoerer.add(cb),
    removeEventListener: (_: string, cb: () => void) => zuhoerer.delete(cb),
  })
  vi.stubGlobal('matchMedia', abfrage)
  return {
    zuhoerer,
    setzeStandalone: (wert: boolean) => {
      stehtAllein = wert
    },
  }
}

/**
 * Baut ein `beforeinstallprompt`-Ereignis nach, wie es Chromium liefert:
 * `prompt()` öffnet den Dialog, `userChoice` löst mit der Entscheidung auf.
 */
function promptEreignis(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const prompt = vi.fn(async () => undefined)
  const ereignis = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome }),
  })
  return { ereignis, prompt }
}

// Jeder Test startet ohne Service Worker, ohne Registrierungs-Mock und ohne
// globale Stubs; `resetModules` im Test sorgt zusätzlich für frischen
// Modulzustand von `pwa.ts`.
afterEach(() => {
  entferneServiceWorker()
  mocks.registerSW.mockReset()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// Registrierung, Update-Hinweis und die Vordergrundprüfung.
describe('useServiceWorkerUpdate', () => {
  // Genau eine Registrierung trotz mehrerer Hooks/Mounts; `immediate: true`
  // startet die Prüfung sofort. `spaeter` blendet nur den Hinweis aus.
  it('registriert den Service Worker genau einmal und meldet ein Update', async () => {
    let optionen: { onNeedRefresh?: () => void } = {}
    mocks.registerSW.mockImplementation((werte) => {
      optionen = werte
      return vi.fn(async () => undefined)
    })
    setzeServiceWorker()

    vi.resetModules()
    const { useServiceWorkerUpdate: hook } = await import('./pwa')
    const ergebnis = renderHook(() => hook())
    expect(mocks.registerSW).toHaveBeenCalledOnce()
    expect(mocks.registerSW.mock.calls[0]![0]).toMatchObject({ immediate: true })
    expect(ergebnis.aktuell().verfuegbar).toBe(false)

    act(() => optionen.onNeedRefresh?.())
    expect(ergebnis.aktuell().verfuegbar).toBe(true)

    act(() => ergebnis.aktuell().spaeter())
    expect(ergebnis.aktuell().verfuegbar).toBe(false)
    ergebnis.unmount()
  })

  // `true` bedeutet „Seite neu laden, sobald der neue Worker übernimmt“.
  // Updates werden nie von selbst eingespielt, damit keine Messung verloren geht.
  it('lädt über den registrierten Aktualisierer neu', async () => {
    const aktualisiere = vi.fn(async () => undefined)
    mocks.registerSW.mockReturnValue(aktualisiere)
    setzeServiceWorker()

    vi.resetModules()
    const { useServiceWorkerUpdate: hook } = await import('./pwa')
    const ergebnis = renderHook(() => hook())

    act(() => ergebnis.aktuell().neuLaden())
    expect(aktualisiere).toHaveBeenCalledWith(true)
    ergebnis.unmount()
  })

  // Am Beckenrand bleibt die App lange offen; ohne diese Prüfung würde sie
  // eine neue Version nie bemerken. `warteAuf` wartet auf die asynchrone
  // `getRegistration`-Kette.
  it('sucht beim Zurückkehren in den Vordergrund nach einer neuen Version', async () => {
    mocks.registerSW.mockReturnValue(vi.fn(async () => undefined))
    const { registrierung } = setzeServiceWorker()

    vi.resetModules()
    const { useServiceWorkerUpdate: hook } = await import('./pwa')
    const ergebnis = renderHook(() => hook())

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await warteAuf(() => registrierung.update.mock.calls.length === 1)
    ergebnis.unmount()
  })

  // Ein weggeklickter Hinweis darf nicht für immer verschwinden: Solange die
  // neue Version wartet, kommt er beim nächsten Vordergrundwechsel zurück.
  it('zeigt einen weggeklickten Update-Hinweis erneut', async () => {
    let optionen: { onNeedRefresh?: () => void } = {}
    mocks.registerSW.mockImplementation((werte) => {
      optionen = werte
      return vi.fn(async () => undefined)
    })
    const { registrierung } = setzeServiceWorker()
    registrierung.waiting = {} as ServiceWorker

    vi.resetModules()
    const { useServiceWorkerUpdate: hook } = await import('./pwa')
    const ergebnis = renderHook(() => hook())

    act(() => optionen.onNeedRefresh?.())
    expect(ergebnis.aktuell().verfuegbar).toBe(true)
    act(() => ergebnis.aktuell().spaeter())
    expect(ergebnis.aktuell().verfuegbar).toBe(false)

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await warteAuf(() => ergebnis.aktuell().verfuegbar)
    ergebnis.unmount()
  })

  // Ein Registrierungsfehler darf die App nicht unterbrechen, muss aber in der
  // Konsole auffindbar sein — sonst wäre fehlende Offline-Fähigkeit unsichtbar.
  it('meldet einen Registrierungsfehler in der Konsole', async () => {
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.registerSW.mockImplementation((werte) => {
      werte?.onRegisterError?.(new Error('kaputt'))
      return vi.fn(async () => undefined)
    })
    setzeServiceWorker()

    vi.resetModules()
    const { useServiceWorkerUpdate: hook } = await import('./pwa')
    const ergebnis = renderHook(() => hook())
    expect(fehler).toHaveBeenCalledWith(
      'Service-Worker-Registrierung fehlgeschlagen:',
      expect.any(Error),
    )
    ergebnis.unmount()
  })

  // Ohne Service-Worker-Unterstützung wird weder registriert noch geprüft; ein
  // direkter `navigator.serviceWorker`-Zugriff würde hier werfen.
  it('bleibt ohne Service-Worker-Unterstützung still', async () => {
    entferneServiceWorker()
    vi.resetModules()
    const { useServiceWorkerUpdate: hook } = await import('./pwa')
    const ergebnis = renderHook(() => hook())

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(mocks.registerSW).not.toHaveBeenCalled()
    ergebnis.unmount()
  })
})

// Nur ein Hinweis für die Kopfzeile: Die App arbeitet lokal und braucht keine
// Verbindung, der Status darf aber nicht hängen bleiben.
describe('useOnlineStatus', () => {
  it('folgt den online- und offline-Ereignissen', () => {
    const ergebnis = renderHook(() => useOnlineStatus())
    expect(ergebnis.aktuell()).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(ergebnis.aktuell()).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(ergebnis.aktuell()).toBe(true)
    ergebnis.unmount()
  })
})

// Installationsangebot: echter Prompt, Ablehnung, fehlender Prompt, bereits
// installierte App und die Anleitung für Browser ohne Prompt (iOS).
describe('useInstallPrompt', () => {
  it('bietet die Installation an und übernimmt die Zustimmung', async () => {
    stelleMatchMedia()
    const ergebnis = renderHook(() => useInstallPrompt())
    expect(ergebnis.aktuell().installiert).toBe(false)
    expect(ergebnis.aktuell().kannInstallieren).toBe(false)

    const { ereignis, prompt } = promptEreignis('accepted')
    act(() => {
      window.dispatchEvent(ereignis)
    })
    expect(ergebnis.aktuell().kannInstallieren).toBe(true)

    await act(async () => {
      await ergebnis.aktuell().installiere()
    })
    expect(prompt).toHaveBeenCalledOnce()
    expect(ergebnis.aktuell().installiert).toBe(true)
    expect(ergebnis.aktuell().kannInstallieren).toBe(false)
    ergebnis.unmount()
  })

  // Der Prompt ist nach einem Aufruf verbraucht — auch bei Ablehnung. Er darf
  // deshalb nicht erneut angeboten werden.
  it('verwirft den Prompt auch bei Ablehnung', async () => {
    stelleMatchMedia()
    const ergebnis = renderHook(() => useInstallPrompt())
    act(() => {
      window.dispatchEvent(promptEreignis('dismissed').ereignis)
    })

    await act(async () => {
      await ergebnis.aktuell().installiere()
    })
    expect(ergebnis.aktuell().installiert).toBe(false)
    expect(ergebnis.aktuell().kannInstallieren).toBe(false)
    ergebnis.unmount()
  })

  // Ohne vorheriges `beforeinstallprompt` ist `installiere` ein No-Op; ein
  // Aufruf darf weder werfen noch den Zustand verändern.
  it('tut nichts ohne vorherigen Prompt', async () => {
    stelleMatchMedia()
    const ergebnis = renderHook(() => useInstallPrompt())
    await act(async () => {
      await ergebnis.aktuell().installiere()
    })
    expect(ergebnis.aktuell().installiert).toBe(false)
    ergebnis.unmount()
  })

  // Läuft die App bereits im eigenen Fenster, ist keine Installation nötig;
  // stattdessen erscheint die Anleitung für das Browsermenü.
  it('erkennt eine bereits installierte App', () => {
    const medien = stelleMatchMedia()
    medien.setzeStandalone(true)
    const ergebnis = renderHook(() => useInstallPrompt())
    expect(ergebnis.aktuell().installiert).toBe(true)
    expect(ergebnis.aktuell().anleitung).toContain('Browsermenü')
    ergebnis.unmount()
  })

  // iOS bietet keinen Installationsdialog; dort muss die Teilen-Anleitung
  // erscheinen, sonst findet niemand den Weg zur installierten App.
  it('zeigt auf iPhone und iPad die Teilen-Anleitung', () => {
    stelleMatchMedia()
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    )
    const ergebnis = renderHook(() => useInstallPrompt())
    expect(ergebnis.aktuell().anleitung).toContain('Zum Home-Bildschirm')
    ergebnis.unmount()
  })

  // iPadOS meldet sich als Mac. Die Erkennung läuft deshalb über die
  // Touch-Punkte, nicht über den User-Agent allein.
  it('erkennt iPadOS an den Touch-Punkten', () => {
    stelleMatchMedia()
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    )
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true })
    const ergebnis = renderHook(() => useInstallPrompt())
    expect(ergebnis.aktuell().anleitung).toContain('Zum Home-Bildschirm')
    ergebnis.unmount()
  })

  // Zwei Wege zur installierten App: das `appinstalled`-Ereignis und ein
  // Wechsel der Anzeigeart. Nach dem Unmount müssen alle Zuhörer entfernt sein,
  // sonst würden verwaiste Hooks weiter Zustand setzen.
  it('reagiert auf appinstalled und Änderungen der Anzeigeart', () => {
    const medien = stelleMatchMedia()
    const ergebnis = renderHook(() => useInstallPrompt())
    act(() => {
      window.dispatchEvent(promptEreignis().ereignis)
    })
    expect(ergebnis.aktuell().kannInstallieren).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
    expect(ergebnis.aktuell().installiert).toBe(true)
    expect(ergebnis.aktuell().kannInstallieren).toBe(false)

    medien.setzeStandalone(false)
    act(() => {
      for (const cb of medien.zuhoerer) cb()
    })
    expect(ergebnis.aktuell().installiert).toBe(false)
    ergebnis.unmount()
    expect(medien.zuhoerer.size).toBe(0)
  })
})
