/**
 * Sichtbare Rücknahme im Timer.
 *
 * Die Fußzeile zeigt während der Messung einen „Zurück“-Knopf. Geprüft wird,
 * dass er die zuletzt bediente Bahn nennt und zurücknimmt, bei Serien die
 * Runde mitzählt und ohne zurücknehmbare Änderung deaktiviert bleibt. Die
 * langen Drücke auf den Kacheln selbst deckt `LaneTile.test.tsx` ab.
 */
// @vitest-environment jsdom
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLauf, startAll } from '../domain/lauf'
import type { Lauf, Satz } from '../domain/types'
import { render } from '../test/render'
import { TimerScreen } from './TimerScreen'

/** 100 m Freistil im 50-m-Becken; feste Strecke, damit kein Zielknopf erscheint. */
const KONFIGURATION = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

// Die Hülle um die Messung braucht keinen echten Provider; die Sheets bleiben
// zu und würden sonst viele weitere Felder verlangen.
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
      bahnen: 2,
      reihen: 1,
      startversatzMs: 0,
      wiederholungen: 1,
      taktSek: 120,
      schwimmerProBahn: [null, null] as (string | null)[],
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
vi.mock('./Startuebersicht', () => ({
  Startuebersicht: () => null,
  StartuebersichtLauf: () => null,
}))
vi.mock('./Bestaetigung', () => ({ Bestaetigung: () => null }))

/** Ein laufender Lauf mit zwei Bahnen; Bahn 1 hat den einzigen Anschlag. */
function laufend(): Lauf {
  const lauf = startAll(createLauf(KONFIGURATION, [{ nummer: 1 }, { nummer: 2 }]), 0, 1_000)
  return {
    ...lauf,
    bahnen: lauf.bahnen.map((bahn, index) =>
      index === 0
        ? {
            ...bahn,
            anschlaege: [
              { laengeNr: 1, splitMs: 30_000, erfasstAt: 2_000, istFinish: false },
            ],
          }
        : bahn,
    ),
  }
}

/** Zwei Runden einer Serie; die jüngste Änderung liegt in Runde 2 auf Bahn 2. */
function serie(): { runden: Lauf[]; satz: Satz } {
  const satz: Satz = {
    id: 'satz-1',
    datum: '2026-10-29',
    bezeichnung: 'Serie',
    konfiguration: KONFIGURATION,
    plan: { wiederholungen: 2, taktSek: 120, startversatzMs: 0 },
    erstelltAm: 1,
  }
  const runden = [1, 2].map((wiederholung) => {
    const lauf = startAll(
      createLauf(KONFIGURATION, [{ nummer: 1 }, { nummer: 2 }], satz.id, { wiederholung }),
      0,
      1_000,
    )
    return {
      ...lauf,
      bahnen: lauf.bahnen.map((bahn, index) =>
        (wiederholung === 1 && index === 0) || (wiederholung === 2 && index === 1)
          ? {
              ...bahn,
              anschlaege: [
                {
                  laengeNr: 1,
                  splitMs: 30_000,
                  erfasstAt: wiederholung * 1_000,
                  istFinish: false,
                },
              ],
            }
          : bahn,
      ),
    }
  })
  return { runden, satz }
}

/** Der „Zurück“-Knopf der Fußzeile. */
function zurueckKnopf(container: HTMLElement): HTMLButtonElement {
  const treffer = [...container.querySelectorAll('button')].find((element) =>
    element.textContent?.startsWith('Zurück'),
  )
  if (!treffer) throw new Error('Knopf „Zurück“ fehlt')
  return treffer
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

describe('TimerScreen: sichtbare Rücknahme', () => {
  it('zeigt die Rücknahme und nimmt die zuletzt bediente Bahn zurück', () => {
    const ergebnis = render(<TimerScreen />)

    // Ohne Bedienung gewinnt die Bahn mit dem jüngsten Anschlag.
    expect(zurueckKnopf(ergebnis.container).textContent).toBe('Zurück · Bahn 1')

    const bahnZwei = ergebnis.container.querySelector<HTMLElement>(
      '[data-bahn="2"] [role="button"]',
    )!
    act(() => {
      bahnZwei.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      bahnZwei.dispatchEvent(new Event('pointerup', { bubbles: true }))
    })
    expect(appWert.tippe).toHaveBeenCalledOnce()

    const knopf = zurueckKnopf(ergebnis.container)
    expect(knopf.disabled).toBe(false)
    expect(knopf.textContent).toBe('Zurück · Bahn 2')
    act(() => knopf.click())
    expect(appWert.rueckgaengig).toHaveBeenCalledWith(appWert.aktiverLauf!.bahnen[1]!.id)
    expect(appWert.rueckgaengigSerie).not.toHaveBeenCalled()

    ergebnis.unmount()
  })

  it('ist nach dem Start auch ohne Anschlag aktiv und nennt die erste Bahn', () => {
    appWert.aktiverLauf = startAll(
      createLauf(KONFIGURATION, [{ nummer: 1 }, { nummer: 2 }]),
      0,
      1_000,
    )
    const ergebnis = render(<TimerScreen />)

    const knopf = zurueckKnopf(ergebnis.container)
    expect(knopf.disabled).toBe(false)
    expect(knopf.textContent).toBe('Zurück · Bahn 1')

    ergebnis.unmount()
  })

  it('deaktiviert die Rücknahme einer Serie ohne Anschläge', () => {
    const { runden, satz } = serie()
    appWert.aktiverLauf = runden[0]!
    appWert.aktiverSatz = satz
    appWert.aktiveRunden = runden.map((runde) => ({
      ...runde,
      bahnen: runde.bahnen.map((bahn) => ({ ...bahn, anschlaege: [] })),
    }))
    appWert.laeufe = appWert.aktiveRunden
    const ergebnis = render(<TimerScreen />)

    expect(zurueckKnopf(ergebnis.container).disabled).toBe(true)

    ergebnis.unmount()
  })

  it('nimmt in einer Serie die Bahn der jüngsten Runde zurück', () => {
    const { runden, satz } = serie()
    appWert.aktiverLauf = runden[1]!
    appWert.aktiverSatz = satz
    appWert.aktiveRunden = runden
    appWert.laeufe = runden
    const ergebnis = render(<TimerScreen />)

    const knopf = zurueckKnopf(ergebnis.container)
    expect(knopf.textContent).toBe('Zurück · Bahn 2 · R2')
    act(() => knopf.click())

    // `rueckgaengigSerie` arbeitet mit dem Bahn-Index, nicht mit der Bahn-ID.
    expect(appWert.rueckgaengigSerie).toHaveBeenCalledWith(1)
    expect(appWert.rueckgaengig).not.toHaveBeenCalled()

    ergebnis.unmount()
  })
})
