import { describe, expect, it } from 'vitest'
import { createLauf, planeLauf, tapLane } from './lauf'
import {
  aktuelleRunde,
  bahnZeile,
  istSerie,
  letzterAnschlag,
  naechsteWiederholung,
  pruefeSeriePlan,
  runden,
  serieFortschritt,
  warnungSeriePlan,
  zeilenZeit,
} from './serie'
import type { Lauf, Satz } from './types'

const K100 = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

function serie(anzahl = 3, taktMs = 120_000, versatzMs = 10_000, bahnen = 1): Lauf[] {
  return Array.from({ length: anzahl }, (_, index) =>
    planeLauf(
      createLauf(
        K100,
        Array.from({ length: bahnen }, (_, i) => ({ nummer: i + 1 })),
        'satz-1',
        { startversatzMs: versatzMs, wiederholung: index + 1 },
      ),
      index * taktMs,
      index * taktMs,
      versatzMs,
    ),
  )
}

function beende(lauf: Lauf, index: number, abStartMs: number): Lauf {
  const bahn = lauf.bahnen[index]!
  const start = bahn.startMs ?? 0
  return tapLane(tapLane(lauf, bahn.id, start + abStartMs, start + abStartMs), bahn.id, start + 60_000, start + 60_000)
}

describe('istSerie', () => {
  it('erkennt einen Satz mit mehreren Wiederholungen', () => {
    const plan = { wiederholungen: 5, taktSek: 120, startversatzMs: 10_000 }
    const satz = { plan } as Satz
    expect(istSerie(satz)).toBe(true)
    expect(istSerie({ plan: null } as Satz)).toBe(false)
    expect(istSerie(null)).toBe(false)
  })
})

describe('runden', () => {
  it('sortiert Wiederholungen nach ihrer Nummer', () => {
    const laeufe = [serie(3)[2]!, serie(3)[0]!]
    const sortiert = runden(laeufe, 'satz-1')
    expect(sortiert).toHaveLength(2)
    expect(sortiert[0]?.wiederholung).toBe(1)
  })

  it('liefert ohne Satz keine Runden', () => {
    expect(runden(serie(2), null)).toEqual([])
  })

  it('kennt die nächste freie Wiederholungsnummer', () => {
    expect(naechsteWiederholung(serie(3))).toBe(4)
  })
})

describe('bahnZeile', () => {
  it('zeigt die laufende Runde und den nächsten Countdown', () => {
    const laeufe = serie(3)
    const mitFertigerErster = [beende(laeufe[0]!, 0, 30_000), laeufe[1]!, laeufe[2]!]
    const zeile = bahnZeile(mitFertigerErster, 0, 70_000)
    expect(zeile.status).toBe('geplant')
    expect(zeile.offen).toBeNull()
    expect(zeile.naechste?.lauf.wiederholung).toBe(2)
    expect(zeile.letzte?.lauf.wiederholung).toBe(1)
    expect(zeile.anzeigeRunde).toBe(2)
    expect(zeilenZeit(zeile, 70_000)).toBe(50_000)
  })

  it('schließt beim Tippen die älteste offene Runde', () => {
    const laeufe = serie(3)
    const mitFertigerErster = [beende(laeufe[0]!, 0, 30_000), laeufe[1]!, laeufe[2]!]
    const zeile = bahnZeile(mitFertigerErster, 0, 130_000)
    expect(zeile.status).toBe('laeuft')
    expect(zeile.offen?.lauf.wiederholung).toBe(2)
    expect(zeile.letzte?.lauf.wiederholung).toBe(1)
  })

  it('markiert eine überholte Runde als überfällig', () => {
    const laeufe = serie(3)
    const mitFertigerErster = [beende(laeufe[0]!, 0, 30_000), laeufe[1]!, laeufe[2]!]
    const zeile = bahnZeile(mitFertigerErster, 0, 250_000)
    expect(zeile.status).toBe('ueberfaellig')
    expect(zeile.offene.map((eintrag) => eintrag.lauf.wiederholung)).toEqual([2, 3])
    expect(zeile.offen?.lauf.wiederholung).toBe(2)
  })

  it('ist fertig, wenn alle Runden im Ziel sind', () => {
    const laeufe = serie(2).map((lauf) => beende(lauf, 0, 30_000))
    const zeile = bahnZeile(laeufe, 0, 300_000)
    expect(zeile.status).toBe('fertig')
    expect(zeile.letzte?.lauf.wiederholung).toBe(2)
    expect(zeilenZeit(zeile, 300_000)).toBe(60_000)
  })
})

describe('letzterAnschlag', () => {
  it('nimmt die tatsächlich jüngste Bedienung, nicht die höchste Runde', () => {
    const laeufe = serie(2)
    const erste = tapLane(laeufe[0]!, laeufe[0]!.bahnen[0]!.id, 30_000, 5_000)
    const zweite = tapLane(laeufe[1]!, laeufe[1]!.bahnen[0]!.id, 150_000, 6_000)
    const treffer = letzterAnschlag([erste, zweite], 0)
    expect(treffer?.lauf.wiederholung).toBe(2)
  })
})

describe('serieFortschritt', () => {
  it('zählt nur vollständig beendete Runden', () => {
    const laeufe = serie(3)
    const mitEinerFertigen = [beende(laeufe[0]!, 0, 30_000), laeufe[1]!, laeufe[2]!]
    expect(serieFortschritt(mitEinerFertigen)).toEqual({ fertig: 1, gesamt: 3 })
  })

  it('kennt die Runde, die gerade im Becken ist', () => {
    expect(aktuelleRunde(serie(3), 0)).toBe(1)
    expect(aktuelleRunde(serie(3), 130_000)).toBe(2)
    expect(aktuelleRunde(serie(3), 250_000)).toBe(3)
  })
})

describe('pruefeSeriePlan', () => {
  const gueltig = { wiederholungen: 5, taktSek: 120, startversatzMs: 10_000 }

  it('akzeptiert einen sinnvollen Plan', () => {
    expect(pruefeSeriePlan(gueltig, 5)).toBeNull()
    expect(warnungSeriePlan(gueltig, 5)).toBeNull()
  })

  it('verlangt mindestens zwei Wiederholungen', () => {
    expect(pruefeSeriePlan({ ...gueltig, wiederholungen: 1 }, 5)).not.toBeNull()
  })

  it('lehnt einen Takt von null ab', () => {
    expect(pruefeSeriePlan({ ...gueltig, taktSek: 0 }, 5)).not.toBeNull()
  })

  it('warnt, wenn der Takt kürzer als der Versatz ist', () => {
    expect(warnungSeriePlan({ ...gueltig, taktSek: 30 }, 5)).not.toBeNull()
  })
})
