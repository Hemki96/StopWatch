/**
 * Screenreader-Ansagen im Timer.
 *
 * Die laufende Zeit steht als gedrosselter `aria-describedby`-Text an den
 * Messflächen (siehe LaneTile.test.tsx). Hier geht es um die eine polite
 * Live-Region: Start, Anschlag, Ziel und Laufende erzeugen genau eine kurze
 * Ansage; ohne Bedienung und ohne Zustandswechsel bleibt sie still. Der
 * Frame-Tick aus `useNow` darf sie nie beschreiben.
 */
// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLauf, startAll } from '../domain/lauf'
import type { Lauf, Satz } from '../domain/types'
import { render } from '../test/render'
import { TimerScreen } from './TimerScreen'

const KONFIGURATION = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

const { appWert } = vi.hoisted(() => ({
  appWert: {
    aktiverLauf: null as Lauf | null,
    aktiverSatz: null as Satz | null,
    aktiveRunden: [] as Lauf[],
    aktiveEintraege: [] as unknown[],
    laeufe: [] as Lauf[],
    schwimmer: [] as { id: string; name: string }[],
    einstellungen: {
      konfiguration: { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' },
      bahnen: 1,
      reihen: 1,
      startversatzMs: 0,
      wiederholungen: 1,
      taktSek: 120,
      schwimmerProBahn: [null] as (string | null)[],
    },
    brauchtTakt: false,
    tabGesperrt: false,
    tippe: vi.fn(),
    tippeSerie: vi.fn(),
    beende: vi.fn(),
    beendeSerie: vi.fn(),
    rueckgaengig: vi.fn(),
    rueckgaengigSerie: vi.fn(),
    waehleLauf: vi.fn(),
    anlegenLauf: vi.fn(),
    schliesseAktivenLauf: vi.fn(),
    verwerfeAktivenLauf: vi.fn(),
    startAlle: vi.fn(),
    neuerLauf: vi.fn(),
    setzeKonfiguration: vi.fn(),
    setzeEinstellungen: vi.fn(),
  },
}))

vi.mock('../app/AppProvider', () => ({ useApp: () => appWert }))
vi.mock('../app/useNow', () => ({ useNow: () => 40_000 }))
vi.mock('../app/useWakeLock', () => ({ useWakeLock: () => true }))
vi.mock('./KonfigurationSheet', () => ({ KonfigurationSheet: () => null }))
vi.mock('./Bestaetigung', () => ({ Bestaetigung: () => null }))
vi.mock('./LaufErgebnis', () => ({ LaufErgebnis: () => null }))
vi.mock('./Startuebersicht', () => ({
  Startuebersicht: ({
    open,
    onStart,
  }: {
    open: boolean
    onStart: () => void
  }) => (open ? <button onClick={onStart}>Jetzt starten</button> : null),
  StartuebersichtLauf: () => null,
}))

/** Eine gestartete Bahn, die noch keinen Anschlag hat. */
function laufend(): Lauf {
  return startAll(createLauf(KONFIGURATION, [{ nummer: 1 }]), 0, 1_000)
}

/** Dieselbe Bahn mit einem Zwischenanschlag; der nächste Tap ist das Ziel. */
function mitAnschlag(): Lauf {
  const lauf = laufend()
  return {
    ...lauf,
    bahnen: lauf.bahnen.map((bahn) => ({
      ...bahn,
      anschlaege: [{ laengeNr: 1, splitMs: 30_000, erfasstAt: 2_000, istFinish: false }],
    })),
  }
}

/** Eine Runde einer Serie auf fester Strecke. */
function serie(): { runden: Lauf[]; satz: Satz } {
  const satz: Satz = {
    id: 'satz-1',
    datum: '2026-10-29',
    bezeichnung: 'Serie',
    konfiguration: KONFIGURATION,
    plan: { wiederholungen: 2, taktSek: 120, startversatzMs: 0 },
    erstelltAm: 1,
  }
  const runde = startAll(
    createLauf(KONFIGURATION, [{ nummer: 1 }], satz.id, { wiederholung: 1 }),
    0,
    1_000,
  )
  return { runden: [runde], satz }
}

/** Text der Live-Region. */
function ansage(container: HTMLElement): string {
  return container.querySelector('[role="status"]')?.textContent ?? ''
}

/** Löst einen Tap wie am Beckenrand aus (PointerDown/Up). */
function tippen(element: Element): void {
  act(() => {
    element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    element.dispatchEvent(new Event('pointerup', { bubbles: true }))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  const lauf = laufend()
  appWert.aktiverLauf = lauf
  appWert.aktiverSatz = null
  appWert.aktiveRunden = []
  appWert.aktiveEintraege = []
  appWert.laeufe = [lauf]
  appWert.schwimmer = []
  appWert.brauchtTakt = false
  appWert.tabGesperrt = false
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TimerScreen: Live-Region', () => {
  it('bleibt ohne Bedienung still, auch über viele Sekunden', () => {
    vi.useFakeTimers()
    const ergebnis = render(<TimerScreen />)

    expect(ansage(ergebnis.container)).toBe('')
    act(() => vi.advanceTimersByTime(5_000))
    expect(ansage(ergebnis.container)).toBe('')

    ergebnis.unmount()
  })

  it('sagt den Start einer Bahn beim ersten Tap an', () => {
    appWert.aktiverLauf = createLauf(KONFIGURATION, [{ nummer: 1 }])
    const ergebnis = render(<TimerScreen />)
    const flaeche = ergebnis.container.querySelector<HTMLElement>('[role="button"]')!

    tippen(flaeche)

    expect(ansage(ergebnis.container)).toBe('Bahn 1 gestartet')
    ergebnis.unmount()
  })

  it('sagt einen Anschlag mit Länge und Zeit an', () => {
    const ergebnis = render(<TimerScreen />)
    const flaeche = ergebnis.container.querySelector<HTMLElement>('[role="button"]')!

    tippen(flaeche)

    expect(ansage(ergebnis.container)).toMatch(/^Bahn 1, Länge 1, \d{2}:\d{2},\d{2}$/)
    ergebnis.unmount()
  })

  it('sagt die letzte Länge als Ziel an und hängt das Laufende an', () => {
    const lauf = mitAnschlag()
    appWert.aktiverLauf = lauf
    appWert.laeufe = [lauf]
    const ergebnis = render(<TimerScreen />)
    const flaeche = ergebnis.container.querySelector<HTMLElement>('[role="button"]')!

    tippen(flaeche)
    expect(ansage(ergebnis.container)).toMatch(/^Bahn 1 im Ziel, \d{2}:\d{2},\d{2}$/)

    // Der Provider hat den Zielanschlag inzwischen gespeichert; der nächste
    // Render sieht den fertigen Lauf und ergänzt „Lauf beendet“.
    const fertig: Lauf = {
      ...lauf,
      bahnen: lauf.bahnen.map((bahn) => ({
        ...bahn,
        anschlaege: [
          ...bahn.anschlaege,
          { laengeNr: 2, splitMs: 60_000, erfasstAt: 3_000, istFinish: true },
        ],
      })),
    }
    appWert.aktiverLauf = fertig
    ergebnis.aktualisiere(<TimerScreen />)

    expect(ansage(ergebnis.container)).toMatch(/im Ziel, \d{2}:\d{2},\d{2}\. Lauf beendet\.$/)
    ergebnis.unmount()
  })

  it('sagt Zwischenzeit und Runde einer Serie an', () => {
    const { runden, satz } = serie()
    // Ein Anschlag fehlt noch: Der nächste Tap ist eine Zwischenzeit.
    appWert.aktiverLauf = runden[0]!
    appWert.aktiverSatz = satz
    appWert.aktiveRunden = runden
    appWert.laeufe = runden
    const ergebnis = render(<TimerScreen />)
    const flaeche = ergebnis.container.querySelector<HTMLElement>('[role="button"]')!

    tippen(flaeche)

    expect(ansage(ergebnis.container)).toMatch(/^Bahn 1, Runde 1, Länge 1, \d{2}:\d{2},\d{2}$/)
    ergebnis.unmount()
  })

  it('sagt den Start aus der Übersicht an', () => {
    appWert.aktiverLauf = null
    appWert.laeufe = []
    appWert.neuerLauf.mockReturnValue('lauf-neu')
    const ergebnis = render(<TimerScreen />)

    const start = [...ergebnis.container.querySelectorAll('button')].find(
      (element) => element.textContent === 'Start',
    )!
    act(() => start.click())
    const jetzt = [...ergebnis.container.querySelectorAll('button')].find(
      (element) => element.textContent === 'Jetzt starten',
    )!
    act(() => jetzt.click())

    expect(appWert.startAlle).toHaveBeenCalledOnce()
    expect(ansage(ergebnis.container)).toBe('Lauf gestartet')
    ergebnis.unmount()
  })
})
