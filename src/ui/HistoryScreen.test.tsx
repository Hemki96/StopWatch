/**
 * Verlauf: seitenweises Rendern der Satzgruppen.
 *
 * Ein großer Bestand darf beim Öffnen nicht alle Gruppen ins DOM schreiben.
 * Die Tests sichern die Seitengröße, das Nachladen ohne Lücke oder Dublette
 * und den unveränderten Leerzustand. Die Gruppierung selbst bleibt Aufgabe des
 * Screens; geprüft wird hier nur, was tatsächlich gerendert wird.
 *
 * Testhilfe: `useApp` wird ersetzt, weil die Tests keinen IndexedDB-Bestand
 * brauchen und die Seite ausschließlich liest.
 */
// @vitest-environment jsdom
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Lauf, Satz } from '../domain/types'
import { render } from '../test/render'
import { HistoryScreen } from './HistoryScreen'

// `vi.mock` wird vor den Imports ausgeführt; der veränderbare Bestand muss
// deshalb über `vi.hoisted` entstehen.
const { appWert } = vi.hoisted(() => ({
  appWert: {
    laeufe: [] as Lauf[],
    satze: [] as Satz[],
    benenneSatz: () => undefined,
    benenneTag: () => undefined,
    loescheSatz: () => undefined,
  },
}))

vi.mock('../app/AppProvider', () => ({ useApp: () => appWert }))

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

/** Ein vollständiger Lauf mit zwei Anschlägen; `hatBegonnen` ist damit wahr. */
function lauf(index: number, satzId = `satz-${index}`): Lauf {
  return {
    id: `lauf-${index}`,
    satzId,
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

/** Ein Satz mit genau einem Lauf und einer eindeutigen Bezeichnung. */
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

/** Alle gerenderten Satzgruppen in Anzeigereihenfolge. */
function gruppen(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('section')]
}

/** Die Bezeichnung eines Satzes steht im Knopf mit `data-satzbezeichnung`. */
function titel(container: HTMLElement): string[] {
  return gruppen(container).map(
    (gruppe) =>
      gruppe.querySelector<HTMLElement>('button[data-satzbezeichnung]')?.textContent?.trim() ??
      '',
  )
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
})

describe('HistoryScreen', () => {
  it('rendert zunächst 50 Gruppen, lädt seitenweise nach und verliert keine Gruppe', () => {
    const daten = bestand(120)
    appWert.laeufe = daten.laeufe
    appWert.satze = daten.satze

    const ergebnis = render(<HistoryScreen />)

    // Neueste zuerst: 120 Sätze, davon die ersten 50 (Satz 119 bis Satz 70).
    expect(gruppen(ergebnis.container)).toHaveLength(50)
    expect(titel(ergebnis.container)[0]).toBe('Satz 119')
    expect(titel(ergebnis.container).at(-1)).toBe('Satz 70')
    expect(ergebnis.container.textContent).toContain('50 von 120 Sätzen angezeigt')
    expect(knopf(ergebnis.container, 'Mehr laden').textContent).toContain('70 weitere')

    // Erste Seite: nur ergänzen, nichts ersetzen.
    act(() => knopf(ergebnis.container, 'Mehr laden').click())
    expect(gruppen(ergebnis.container)).toHaveLength(100)
    expect(titel(ergebnis.container)[0]).toBe('Satz 119')
    expect(titel(ergebnis.container).at(-1)).toBe('Satz 20')
    expect(knopf(ergebnis.container, 'Mehr laden').textContent).toContain('20 weitere')

    // Letzte Seite: alle Gruppen genau einmal, der Knopf verschwindet.
    act(() => knopf(ergebnis.container, 'Mehr laden').click())
    expect(gruppen(ergebnis.container)).toHaveLength(120)
    expect(titel(ergebnis.container)).toEqual(
      Array.from({ length: 120 }, (_, index) => `Satz ${119 - index}`),
    )
    expect(new Set(titel(ergebnis.container)).size).toBe(120)
    expect(ergebnis.container.textContent).toContain('120 von 120 Sätzen angezeigt')
    expect(
      [...ergebnis.container.querySelectorAll('button')].some((kandidat) =>
        kandidat.textContent?.includes('Mehr laden'),
      ),
    ).toBe(false)

    ergebnis.unmount()
  })

  it('zeigt den Tagesnamen an und speichert einen geänderten Namen am Datum', () => {
    const daten = bestand(1)
    appWert.laeufe = daten.laeufe
    appWert.satze = [{ ...daten.satze[0]!, tagesbezeichnung: 'Kader A' }]
    const benenneTag = vi.fn()
    appWert.benenneTag = benenneTag

    const ergebnis = render(<HistoryScreen />)
    expect(ergebnis.container.textContent).toContain('Kader A')

    // Der Tagesname ist ein Knopf; er öffnet ein Feld mit dem bisherigen Wert.
    act(() => knopf(ergebnis.container, 'Kader A').click())
    const feld = ergebnis.container.querySelector<HTMLInputElement>(
      'input[aria-label="Tagesbezeichnung"]',
    )
    expect(feld?.value).toBe('Kader A')

    // Controlled input: Der native Setter plus `input`-Event ist der Weg, den
    // React auch im Browser sieht.
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set
    act(() => {
      if (!feld || !setter) throw new Error('Eingabefeld fehlt')
      setter.call(feld, 'Kader B')
      feld.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      feld?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(benenneTag).toHaveBeenCalledWith('2025-01-01', 'Kader B')

    ergebnis.unmount()
  })

  it('zeigt ohne Messungen weiterhin den leeren Zustand', () => {
    const ergebnis = render(<HistoryScreen />)

    expect(ergebnis.container.textContent).toContain('Noch keine Messungen.')
    expect(ergebnis.container.textContent).not.toContain('Mehr laden')

    ergebnis.unmount()
  })
})
