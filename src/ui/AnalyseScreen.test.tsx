/**
 * Analyse: seitenweise Satzliste (#52).
 *
 * Ein großer Bestand darf beim Öffnen nicht alle Sätze auswerten oder ins DOM
 * schreiben. Die Tests sichern die Seitengröße, das Nachladen ohne Lücke oder
 * Dublette, den unveränderten Leerzustand und dass verborgene Sätze weder
 * gerendert noch über `kennzahlenFuerSatz` ausgewertet werden.
 *
 * Testhilfe: `useApp` wird ersetzt, weil die Liste ausschließlich liest. Die
 * Kennzahlen kommen aus dem echten Memo-Seam; die Hülle zählt nur die Aufrufe.
 */
// @vitest-environment jsdom
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Lauf, Satz } from '../domain/types'
import { render } from '../test/render'
import { kennzahlenFuerSatz } from './analyseMemo'
import { AnalyseScreen } from './AnalyseScreen'

// `vi.mock` wird vor den Imports ausgeführt; der veränderbare Bestand muss
// deshalb über `vi.hoisted` entstehen.
const { appWert } = vi.hoisted(() => ({
  appWert: {
    laeufe: [] as Lauf[],
    satze: [] as Satz[],
    schwimmer: [] as [],
  },
}))

vi.mock('../app/AppProvider', () => ({ useApp: () => appWert }))

// Echte Auswertung beibehalten, aber die Aufrufe zählen: So belegt der Test,
// dass verborgene Sätze gar nicht erst berechnet werden.
vi.mock('./analyseMemo', async (importOriginal) => {
  const original = await importOriginal<typeof import('./analyseMemo')>()
  return { ...original, kennzahlenFuerSatz: vi.fn(original.kennzahlenFuerSatz) }
})

/** Konfiguration des Standardlaufs: 100 m Freistil im 50-m-Becken. */
const KONFIGURATION = {
  beckenlaengeM: 50,
  streckeM: 100,
  schwimmart: 'freistil',
} as const

/** Ein ISO-Datum je Index, aufsteigend, damit die Sortierung prüfbar ist. */
function datum(index: number): string {
  return new Date(Date.UTC(2025, 0, 1) + index * 86_400_000).toISOString().slice(0, 10)
}

/** Ein Lauf mit zwei Anschlägen; damit ist der Satz auswertbar. */
function lauf(index: number): Lauf {
  return {
    id: `lauf-${index}`,
    satzId: `satz-${index}`,
    konfiguration: { ...KONFIGURATION },
    startWallMs: Date.UTC(2025, 0, 1) + index * 86_400_000 + 12 * 3_600_000,
    startversatzMs: 0,
    wiederholung: null,
    bahnen: [
      {
        id: `bahn-${index}`,
        nummer: 1,
        reihe: 1,
        schwimmerId: null,
        startMs: 0,
        anschlaege: [
          { laengeNr: 1, splitMs: 30_000, erfasstAt: 0, istFinish: false },
          { laengeNr: 2, splitMs: 60_000 + index, erfasstAt: 0, istFinish: true },
        ],
      },
    ],
  }
}

/** Ein Bestand aus `anzahl` Sätzen mit je einem auswertbaren Lauf. */
function bestand(anzahl: number): { laeufe: Lauf[]; satze: Satz[] } {
  return {
    laeufe: Array.from({ length: anzahl }, (_, index) => lauf(index)),
    satze: Array.from({ length: anzahl }, (_, index) => ({
      id: `satz-${index}`,
      datum: datum(index),
      bezeichnung: `Satz ${index}`,
      konfiguration: { ...KONFIGURATION },
      plan: null,
      erstelltAm: 0,
    })),
  }
}

/** Alle gerenderten Satzzeilen in Anzeigereihenfolge. */
function karten(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-analyse-satz]')]
}

/** Die Satz-IDs der gerenderten Zeilen. */
function ids(container: HTMLElement): string[] {
  return karten(container).map((karte) => karte.dataset.analyseSatz ?? '')
}

/** Findet einen Knopf über seinen sichtbaren Text. */
function knopf(container: HTMLElement, text: string): HTMLButtonElement {
  const gefunden = [...container.querySelectorAll('button')].find((kandidat) =>
    kandidat.textContent?.includes(text),
  )
  if (!gefunden) throw new Error(`Knopf „${text}“ fehlt`)
  return gefunden
}

beforeEach(() => {
  appWert.laeufe = []
  appWert.satze = []
  vi.mocked(kennzahlenFuerSatz).mockClear()
})

describe('AnalyseScreen', () => {
  it('rendert zunächst 50 Sätze, lädt seitenweise nach und verliert keinen Satz', () => {
    const daten = bestand(120)
    appWert.laeufe = daten.laeufe
    appWert.satze = daten.satze

    const ergebnis = render(<AnalyseScreen />)

    // Neueste zuerst: 120 Sätze, davon die ersten 50 (Satz 119 bis Satz 70).
    expect(karten(ergebnis.container)).toHaveLength(50)
    expect(ids(ergebnis.container)[0]).toBe('satz-119')
    expect(ids(ergebnis.container).at(-1)).toBe('satz-70')
    expect(ergebnis.container.textContent).toContain('50 von 120 Sätzen angezeigt')
    expect(knopf(ergebnis.container, 'Mehr laden').textContent).toContain('70 weitere')

    // Nur die sichtbaren Sätze laufen durch die Auswertung.
    const ausgewertet = new Set(
      vi.mocked(kennzahlenFuerSatz).mock.calls.map(([satz]) => satz.id),
    )
    expect(ausgewertet).toEqual(new Set(ids(ergebnis.container)))

    // Erste Seite: nur ergänzen, nichts ersetzen.
    act(() => knopf(ergebnis.container, 'Mehr laden').click())
    expect(karten(ergebnis.container)).toHaveLength(100)
    expect(ids(ergebnis.container)[0]).toBe('satz-119')
    expect(ids(ergebnis.container).at(-1)).toBe('satz-20')
    expect(knopf(ergebnis.container, 'Mehr laden').textContent).toContain('20 weitere')

    // Letzte Seite: alle Sätze genau einmal, der Knopf verschwindet.
    act(() => knopf(ergebnis.container, 'Mehr laden').click())
    expect(karten(ergebnis.container)).toHaveLength(120)
    expect(ids(ergebnis.container)).toEqual(
      Array.from({ length: 120 }, (_, index) => `satz-${119 - index}`),
    )
    expect(new Set(ids(ergebnis.container)).size).toBe(120)
    expect(ergebnis.container.textContent).toContain('120 von 120 Sätzen angezeigt')
    expect(
      [...ergebnis.container.querySelectorAll('button')].some((kandidat) =>
        kandidat.textContent?.includes('Mehr laden'),
      ),
    ).toBe(false)

    ergebnis.unmount()
  })

  it('schreibt verborgene Sätze nicht ins DOM und wertet sie nicht aus', () => {
    const daten = bestand(120)
    appWert.laeufe = daten.laeufe
    appWert.satze = daten.satze

    const ergebnis = render(<AnalyseScreen />)

    // Außerhalb der ersten Seite fehlt die Zeile vollständig.
    expect(ergebnis.container.querySelector('[data-analyse-satz="satz-0"]')).toBeNull()
    expect(ergebnis.container.querySelector('[data-analyse-satz="satz-55"]')).toBeNull()
    expect(
      vi.mocked(kennzahlenFuerSatz).mock.calls.some(([satz]) => satz.id === 'satz-0'),
    ).toBe(false)

    act(() => knopf(ergebnis.container, 'Mehr laden').click())

    // Nach einer Seite ist satz-55 sichtbar, satz-0 bleibt es nicht.
    expect(ergebnis.container.querySelector('[data-analyse-satz="satz-55"]')).not.toBeNull()
    expect(ergebnis.container.querySelector('[data-analyse-satz="satz-0"]')).toBeNull()

    ergebnis.unmount()
  })

  it('zeigt ohne auswertbare Sätze weiterhin den leeren Zustand', () => {
    const ergebnis = render(<AnalyseScreen />)

    expect(ergebnis.container.textContent).toContain('Noch keine auswertbaren Sätze.')
    expect(ergebnis.container.textContent).not.toContain('Mehr laden')

    ergebnis.unmount()
  })
})
