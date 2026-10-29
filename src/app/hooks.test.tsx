/**
 * Hooks der Messoberfläche: Anzeigezeit, reduzierte Bewegung und Wake Lock.
 *
 * Die Datei sichert die Randbedingungen ab, unter denen die App am Beckenrand
 * läuft: `useNow` fordert nur bei aktivem Takt Frames an und bricht die Schleife
 * beim Unmount ab; `useReducedMotion` folgt der Systemeinstellung und räumt
 * Zuhörer ab; `useWakeLock` fordert die Sperre nur bei laufender Messung an,
 * erneuert sie nach dem Zurückkehren in den Vordergrund und bleibt ohne API
 * still.
 *
 * Testhilfen: `requestAnimationFrame` und `performance.now` sind gestubbt,
 * damit Frames deterministisch ausgelöst werden. Für den Wake Lock gibt es
 * einen eigenen Sentinel-Mock, weil jsdom die API nicht kennt; `durchlaufen`
 * lässt die asynchrone Anfrage-Promise ablaufen.
 */
// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, warteAuf } from '../test/render'
import { useNow } from './useNow'
import { useReducedMotion } from './useReducedMotion'
import { useWakeLock } from './useWakeLock'

// Stubs und Spies gelten nur im jeweiligen Test.
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/**
 * Lässt ausstehende Promises und Effekte durchlaufen.
 *
 * Nötig für `useWakeLock`: `wakeLock.request` löst erst in einem späteren
 * Microtask/Macrotask auf, und der Effekt setzt den Zustand danach. `act` sorgt
 * dafür, dass React die Aktualisierung verarbeitet.
 */
async function durchlaufen(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

// Die Anzeigezeit kommt aus `performance.now()` und wird pro Frame neu
// abgetastet. Bei `aktiv === false` darf kein Frame laufen (Akku, Hintergrund);
// der Cleanup bricht den letzten Frame ab, damit keine doppelte Schleife
// entsteht.
describe('useNow', () => {
  it('aktualisiert die Zeit nur bei aktivem Takt', () => {
    let jetzt = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => jetzt)
    const raf = vi.fn<(cb: FrameRequestCallback) => number>()
    const cancel = vi.fn()
    vi.stubGlobal('requestAnimationFrame', raf)
    vi.stubGlobal('cancelAnimationFrame', cancel)

    // Inaktiver Takt: Der Startwert steht, es wird aber kein Frame angefordert.
    const inaktiv = renderHook(() => useNow(false))
    expect(inaktiv.aktuell()).toBe(1000)
    expect(raf).not.toHaveBeenCalled()
    inaktiv.unmount()

    // Aktiver Takt: Der erste Tick liest die neue Zeit und plant genau einen
    // weiteren Frame — nie mehrere parallel.
    jetzt = 5000
    const aktiv = renderHook(() => useNow(true))
    expect(raf).toHaveBeenCalledOnce()
    const tick = raf.mock.calls[0]![0]
    act(() => tick(0))
    expect(aktiv.aktuell()).toBe(5000)
    expect(raf).toHaveBeenCalledTimes(2)

    aktiv.unmount()
    expect(cancel).toHaveBeenCalled()
  })
})

// `prefers-reduced-motion` steuert Animationen. Der Hook muss den Live-Wechsel
// der Systemeinstellung übernehmen und beim Unmount den Zuhörer entfernen.
describe('useReducedMotion', () => {
  it('folgt der Systemeinstellung und hört auf Änderungen', () => {
    let matches = true
    const zuhoerer = new Set<(event: MediaQueryListEvent) => void>()
    const abfrage = {
      get matches() {
        return matches
      },
      addEventListener: (_: string, cb: (event: MediaQueryListEvent) => void) => zuhoerer.add(cb),
      removeEventListener: (_: string, cb: (event: MediaQueryListEvent) => void) =>
        zuhoerer.delete(cb),
    }
    vi.stubGlobal('matchMedia', () => abfrage)

    const ergebnis = renderHook(() => useReducedMotion())
    expect(ergebnis.aktuell()).toBe(true)

    // Der Zuhörer wird direkt ausgelöst; das Ereignisobjekt braucht nur
    // `matches`, weil der Hook nicht mehr aus der Abfrage liest.
    matches = false
    act(() => {
      for (const cb of zuhoerer) cb({ matches } as MediaQueryListEvent)
    })
    expect(ergebnis.aktuell()).toBe(false)

    ergebnis.unmount()
    expect(zuhoerer.size).toBe(0)
  })

  // Ältere oder eingebettete Browser ohne `matchMedia`: keine Animationen
  // abschalten, aber auch nicht werfen.
  it('bleibt ohne matchMedia bei false', () => {
    vi.stubGlobal('matchMedia', undefined)
    const ergebnis = renderHook(() => useReducedMotion())
    expect(ergebnis.aktuell()).toBe(false)
    ergebnis.unmount()
  })
})

// Screen Wake Lock: Der Bildschirm bleibt an, solange gemessen wird. Die API
// ist optional und darf die Bedienung nie blockieren; der Rückgabewert ist
// eine Anzeige, keine Garantie.
describe('useWakeLock', () => {
  /**
   * Nachbau eines `WakeLockSentinel`: `release` ist beobachtbar, und das
   * `release`-Ereignis lässt sich auslösen. Der Browser kann die Sperre selbst
   * lösen (Hintergrund, Energiesparen); genau dieser Fall wird damit geprüft.
   */
  interface SentinelMock {
    release: ReturnType<typeof vi.fn>
    addEventListener: (typ: string, cb: () => void) => void
    ausloesen: () => void
  }

  function sentinel(): SentinelMock {
    const zuhoerer = new Set<() => void>()
    return {
      release: vi.fn(async () => undefined),
      addEventListener: (typ, cb) => {
        if (typ === 'release') zuhoerer.add(cb)
      },
      ausloesen: () => {
        for (const cb of zuhoerer) cb()
      },
    }
  }

  /** Setzt `navigator.wakeLock.request` und gibt den Spion für Aufrufzählungen zurück. */
  function setzeWakeLock(anfrage: () => Promise<unknown>) {
    const request = vi.fn(anfrage)
    vi.stubGlobal('navigator', { wakeLock: { request } })
    return request
  }

  // Nur eine laufende Messung hält den Bildschirm an. Beim Unmount muss die
  // Sperre freigegeben werden, sonst bliebe sie für den Rest der Sitzung aktiv.
  it('fordert die Sperre nur bei aktiv an und gibt sie beim Abbau frei', async () => {
    const wach = sentinel()
    const request = setzeWakeLock(async () => wach)

    const inaktiv = renderHook(() => useWakeLock(false))
    expect(inaktiv.aktuell()).toBe(false)
    expect(request).not.toHaveBeenCalled()
    inaktiv.unmount()

    const aktiv = renderHook(() => useWakeLock(true))
    await warteAuf(() => aktiv.aktuell())
    expect(aktiv.aktuell()).toBe(true)

    // Der Browser löst die Sperre selbst: Die Anzeige muss zurückspringen.
    act(() => wach.ausloesen())
    expect(aktiv.aktuell()).toBe(false)

    aktiv.unmount()
    expect(wach.release).toHaveBeenCalled()
  })

  // Im Hintergrund löst der Browser die Sperre; beim Zurückkehren muss sie neu
  // angefordert werden. Der Test prüft genau zwei Anfragen (Start + Rückkehr).
  it('fordert die Sperre nach dem Zurückkehren in den Vordergrund erneut an', async () => {
    const wach = sentinel()
    const request = setzeWakeLock(async () => wach)

    const ergebnis = renderHook(() => useWakeLock(true))
    await warteAuf(() => request.mock.calls.length === 1)

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await warteAuf(() => request.mock.calls.length === 2)
    ergebnis.unmount()
  })

  // Ohne Wake-Lock-Unterstützung (iOS Safari, Desktop) bleibt der Hook still
  // und meldet `false`, statt zu werfen.
  it('bleibt ohne Unterstützung ruhig', async () => {
    vi.stubGlobal('navigator', {})
    const ergebnis = renderHook(() => useWakeLock(true))
    await durchlaufen()
    expect(ergebnis.aktuell()).toBe(false)
    ergebnis.unmount()
  })

  // Verweigerte Erlaubnis oder ein Fehler der API ist kein Absturzgrund; die
  // Messung läuft weiter und die Anzeige bleibt aus.
  it('meldet false, wenn die Anfrage scheitert', async () => {
    setzeWakeLock(async () => {
      throw new Error('nicht erlaubt')
    })
    const ergebnis = renderHook(() => useWakeLock(true))
    await durchlaufen()
    expect(ergebnis.aktuell()).toBe(false)
    ergebnis.unmount()
  })
})
