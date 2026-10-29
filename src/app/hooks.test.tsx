// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, warteAuf } from '../test/render'
import { useNow } from './useNow'
import { useReducedMotion } from './useReducedMotion'
import { useWakeLock } from './useWakeLock'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Lässt ausstehende Promises und Effekte durchlaufen. */
async function durchlaufen(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('useNow', () => {
  it('aktualisiert die Zeit nur bei aktivem Takt', () => {
    let jetzt = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => jetzt)
    const raf = vi.fn<(cb: FrameRequestCallback) => number>()
    const cancel = vi.fn()
    vi.stubGlobal('requestAnimationFrame', raf)
    vi.stubGlobal('cancelAnimationFrame', cancel)

    const inaktiv = renderHook(() => useNow(false))
    expect(inaktiv.aktuell()).toBe(1000)
    expect(raf).not.toHaveBeenCalled()
    inaktiv.unmount()

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

    matches = false
    act(() => {
      for (const cb of zuhoerer) cb({ matches } as MediaQueryListEvent)
    })
    expect(ergebnis.aktuell()).toBe(false)

    ergebnis.unmount()
    expect(zuhoerer.size).toBe(0)
  })

  it('bleibt ohne matchMedia bei false', () => {
    vi.stubGlobal('matchMedia', undefined)
    const ergebnis = renderHook(() => useReducedMotion())
    expect(ergebnis.aktuell()).toBe(false)
    ergebnis.unmount()
  })
})

describe('useWakeLock', () => {
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

  function setzeWakeLock(anfrage: () => Promise<unknown>) {
    const request = vi.fn(anfrage)
    vi.stubGlobal('navigator', { wakeLock: { request } })
    return request
  }

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

    act(() => wach.ausloesen())
    expect(aktiv.aktuell()).toBe(false)

    aktiv.unmount()
    expect(wach.release).toHaveBeenCalled()
  })

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

  it('bleibt ohne Unterstützung ruhig', async () => {
    vi.stubGlobal('navigator', {})
    const ergebnis = renderHook(() => useWakeLock(true))
    await durchlaufen()
    expect(ergebnis.aktuell()).toBe(false)
    ergebnis.unmount()
  })

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
