/**
 * Designmodul: Auflösung, gespeicherte Wahl und Spiegelung ins Dokument.
 *
 * Die Tests sichern die Naht ab, die der Provider früher selbst hielt:
 * `system` folgt `prefers-color-scheme`, eine feste Wahl überstimmt das System,
 * `system` bleibt als gespeicherte Wahl erhalten, und der Zuhörer wird beim
 * Unmount wieder entfernt. `matchMedia` und die Meta-Tags sind Attrappen, weil
 * jsdom beides nicht mitbringt.
 */
// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { legacySchluessel, speicherSchluessel } from '../storage/namensraum'
import { renderHook } from '../test/render'
import { leseThemeEinstellung, useTheme } from './theme'

const THEME_KEY = speicherSchluessel('theme')

/** Gemountete Hooks werden im `afterEach` abgebaut, damit kein Effekt leckt. */
const offeneHooks: Array<{ unmount: () => void }> = []

/**
 * Steuerbare `prefers-color-scheme`-Abfrage. `dunkel` ist die Systempräferenz;
 * `matches` der Abfrage nach „hell“ ist deshalb das Gegenteil.
 */
function stelleSystem(dunkel: boolean) {
  const zuhoerer = new Set<(event: MediaQueryListEvent) => void>()
  const entfernt = vi.fn()
  const abfrage = {
    get matches() {
      return !dunkel
    },
    addEventListener: (_typ: string, cb: (event: MediaQueryListEvent) => void) => {
      zuhoerer.add(cb)
    },
    removeEventListener: (_typ: string, cb: (event: MediaQueryListEvent) => void) => {
      entfernt(_typ, cb)
      zuhoerer.delete(cb)
    },
  }
  vi.stubGlobal('matchMedia', vi.fn(() => abfrage))

  return {
    zuhoerer,
    entfernt,
    setze: (naechsteDunkel: boolean) => {
      dunkel = naechsteDunkel
    },
    loeseAus: () => {
      for (const cb of zuhoerer) cb({ matches: !dunkel } as MediaQueryListEvent)
    },
  }
}

/** Startet den Hook und merkt ihn für den gemeinsamen Abbau. */
function starteTheme() {
  const hook = renderHook(() => useTheme())
  offeneHooks.push(hook)
  return hook
}

/** Baut einen Hook vorzeitig ab, ohne ihn im `afterEach` doppelt abzubauen. */
function beende(hook: { unmount: () => void }) {
  const index = offeneHooks.indexOf(hook)
  if (index >= 0) offeneHooks.splice(index, 1)
  hook.unmount()
}

/** Inhalt eines Meta-Tags; `null`, wenn es fehlt. */
function meta(name: string): string | null {
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? null
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
  document.documentElement.style.colorScheme = ''
  document.head.innerHTML = [
    '<meta name="theme-color" content="#070c15">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black">',
  ].join('')
})

afterEach(() => {
  for (const hook of offeneHooks.splice(0)) hook.unmount()
  vi.unstubAllGlobals()
})

// `system` ist die Voreinstellung und folgt der Betriebssystem-Einstellung.
// Jede Auflösung wird sofort in Klasse, Farbschema, Meta und iOS-Leiste
// gespiegelt, damit ein Wechsel nicht nur React, sondern auch die Browser-Chrome
// erreicht.
describe('useTheme', () => {
  it('folgt als system der Systemeinstellung und spiegelt sie ins Dokument', () => {
    const system = stelleSystem(false)
    const hook = starteTheme()

    expect(hook.aktuell().themeEinstellung).toBe('system')
    expect(hook.aktuell().theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(meta('theme-color')).toBe('#eef2f7')
    expect(meta('apple-mobile-web-app-status-bar-style')).toBe('default')

    act(() => {
      system.setze(true)
      system.loeseAus()
    })

    expect(hook.aktuell().theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(meta('theme-color')).toBe('#070c15')
    expect(meta('apple-mobile-web-app-status-bar-style')).toBe('black')
  })

  // Eine feste Wahl überstimmt das System; sie wird erst wieder verlassen, wenn
  // der Nutzer erneut `system` wählt.
  it('liest eine gespeicherte Wahl und überstimmt das System', () => {
    localStorage.setItem(THEME_KEY, 'light')
    stelleSystem(true)

    const hook = starteTheme()
    expect(hook.aktuell().themeEinstellung).toBe('light')
    expect(hook.aktuell().theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  // `system` bleibt die gespeicherte Wahl, nicht das aufgelöste Design. Nur so
  // folgt die App später einer Änderung des Systems.
  it('merkt system als Wahl und folgt danach wieder dem System', () => {
    const system = stelleSystem(false)
    const hook = starteTheme()

    act(() => hook.aktuell().setzeTheme('dark'))
    expect(hook.aktuell().theme).toBe('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')

    act(() => {
      system.setze(true)
      system.loeseAus()
    })
    expect(hook.aktuell().theme).toBe('dark')

    act(() => hook.aktuell().setzeTheme('system'))
    expect(localStorage.getItem(THEME_KEY)).toBe('system')
    expect(hook.aktuell().theme).toBe('dark')

    act(() => {
      system.setze(false)
      system.loeseAus()
    })
    expect(hook.aktuell().theme).toBe('light')
  })

  // Der Listener darf nach dem Unmount nicht weiterlaufen; sonst hielte er den
  // Hook bzw. den gesamten Provider unnötig am Leben.
  it('entfernt den Zuhörer beim Unmount', () => {
    const system = stelleSystem(false)
    const hook = starteTheme()
    expect(system.zuhoerer.size).toBe(1)

    beende(hook)

    expect(system.entfernt).toHaveBeenCalledWith('change', expect.any(Function))
    expect(system.zuhoerer.size).toBe(0)
  })

  // Ältere oder eingebettete Browser ohne `matchMedia`: dunkler Standard statt
  // Absturz, wie beim Inline-Boot in `index.html`.
  it('startet ohne matchMedia dunkel', () => {
    vi.stubGlobal('matchMedia', undefined)
    const hook = starteTheme()

    expect(hook.aktuell().theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})

// Der Schlüssel bleibt logisch `theme`; `lokalSpeicher` setzt den Namensraum
// davor und liest den früheren Schlüssel für bestehende Installationen.
describe('leseThemeEinstellung', () => {
  it('liest den namensraumgebundenen Schlüssel samt altem Rückfall', () => {
    localStorage.setItem(THEME_KEY, 'dark')
    expect(leseThemeEinstellung()).toBe('dark')

    localStorage.clear()
    localStorage.setItem(legacySchluessel('theme'), 'light')
    expect(leseThemeEinstellung()).toBe('light')

    localStorage.setItem(THEME_KEY, 'unbekannt')
    expect(leseThemeEinstellung()).toBe('system')
  })
})
