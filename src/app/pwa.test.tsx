// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, warteAuf } from '../test/render'
import { useInstallPrompt, useOnlineStatus } from './pwa'

const mocks = vi.hoisted(() => ({
  registerSW: vi.fn(),
}))

vi.mock('virtual:pwa-register', () => ({
  registerSW: mocks.registerSW,
}))

interface RegistrierungMock {
  update: ReturnType<typeof vi.fn>
}

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

function entferneServiceWorker() {
  Reflect.deleteProperty(navigator, 'serviceWorker')
}

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

function promptEreignis(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const prompt = vi.fn(async () => undefined)
  const ereignis = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome }),
  })
  return { ereignis, prompt }
}

afterEach(() => {
  entferneServiceWorker()
  mocks.registerSW.mockReset()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useServiceWorkerUpdate', () => {
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

  it('tut nichts ohne vorherigen Prompt', async () => {
    stelleMatchMedia()
    const ergebnis = renderHook(() => useInstallPrompt())
    await act(async () => {
      await ergebnis.aktuell().installiere()
    })
    expect(ergebnis.aktuell().installiert).toBe(false)
    ergebnis.unmount()
  })

  it('erkennt eine bereits installierte App', () => {
    const medien = stelleMatchMedia()
    medien.setzeStandalone(true)
    const ergebnis = renderHook(() => useInstallPrompt())
    expect(ergebnis.aktuell().installiert).toBe(true)
    expect(ergebnis.aktuell().anleitung).toContain('Browsermenü')
    ergebnis.unmount()
  })

  it('zeigt auf iPhone und iPad die Teilen-Anleitung', () => {
    stelleMatchMedia()
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    )
    const ergebnis = renderHook(() => useInstallPrompt())
    expect(ergebnis.aktuell().anleitung).toContain('Zum Home-Bildschirm')
    ergebnis.unmount()
  })

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
