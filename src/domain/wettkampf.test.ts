import { describe, expect, it } from 'vitest'
import { createLauf, setzeZielzeit, startAll, tapLane } from './lauf'
import {
  createWettkampf,
  createWettkampfLauf,
  createWettkampfSatz,
  wettkampfErgebnis,
  wettkampfFortschritt,
} from './wettkampf'
import type { Lauf } from './types'

function wettkampfLauf(): Lauf {
  const wettkampf = createWettkampf({
    name: 'Herbstpokal',
    datum: '2026-10-29',
    beckenlaengeM: 50,
  })
  const satz = createWettkampfSatz(wettkampf, {
    bezeichnung: '100 m Freistil',
    streckeM: 100,
    schwimmart: 'freistil',
    laeufe: [],
  })
  return createWettkampfLauf(
    satz,
    {
      nummer: 1,
      starts: [
        { name: 'Anna', bahn: 3 },
        { name: 'Ben', bahn: 4 },
        { name: 'Clara', bahn: 5 },
      ],
    },
    (start) => start.name,
  )
}

describe('Wettkampfmodus', () => {
  it('macht aus dem ersten Tap nach dem Start direkt das Ziel', () => {
    let lauf = startAll(wettkampfLauf(), 1000, 10_000)
    const bahn = lauf.bahnen[0]!
    lauf = tapLane(lauf, bahn.id, 61_250, 11_000)

    expect(lauf.bahnen[0]?.anschlaege).toHaveLength(1)
    expect(lauf.bahnen[0]?.anschlaege[0]?.istFinish).toBe(true)
    expect(lauf.bahnen[0]?.anschlaege[0]?.splitMs).toBe(60_250)
  })

  it('startet eine noch nicht gestartete Bahn mit dem ersten Tap', () => {
    let lauf = wettkampfLauf()
    const bahn = lauf.bahnen[0]!
    lauf = tapLane(lauf, bahn.id, 5000, 5000)
    expect(lauf.bahnen[0]?.startMs).toBe(5000)
    expect(lauf.bahnen[0]?.anschlaege).toHaveLength(0)
  })

  it('startet beendete Bahnen nicht erneut', () => {
    let lauf = startAll(wettkampfLauf(), 0, 0)
    const bahn = lauf.bahnen[0]!
    lauf = tapLane(lauf, bahn.id, 60_000, 60_000)
    const nachher = startAll(lauf, 100_000, 100_000)
    expect(nachher.bahnen[0]?.startMs).toBe(0)
  })
})

describe('wettkampfErgebnis', () => {
  function mitZeiten(zeiten: (number | null)[]): Lauf {
    let lauf = startAll(wettkampfLauf(), 0, 0)
    zeiten.forEach((zeit, index) => {
      if (zeit === null) return
      const bahn = lauf.bahnen[index]
      if (!bahn) return
      lauf = tapLane(lauf, bahn.id, zeit, zeit)
    })
    return lauf
  }

  it('sortiert nach Zeit und vergibt Plätze', () => {
    const ergebnis = wettkampfErgebnis(mitZeiten([62_000, 60_000, 61_000]))
    expect(ergebnis.map((zeile) => zeile.bahn.nummer)).toEqual([4, 5, 3])
    expect(ergebnis.map((zeile) => zeile.platz)).toEqual([1, 2, 3])
    expect(ergebnis[0]?.rueckstandMs).toBe(0)
    expect(ergebnis[1]?.rueckstandMs).toBe(1000)
  })

  it('teilt Plätze bei zeitgleichen Ergebnissen auf Hundertstel', () => {
    const ergebnis = wettkampfErgebnis(mitZeiten([60_001, 60_009, 61_000]))
    expect(ergebnis.map((zeile) => zeile.platz)).toEqual([1, 1, 3])
    expect(ergebnis[0]?.rueckstandMs).toBe(0)
    expect(ergebnis[1]?.rueckstandMs).toBe(8)
  })

  it('hängt offene Bahnen hinten an', () => {
    const ergebnis = wettkampfErgebnis(mitZeiten([60_000, null, null]))
    expect(ergebnis[0]?.bahn.nummer).toBe(3)
    expect(ergebnis.slice(1).map((zeile) => zeile.platz)).toEqual([null, null])
  })
})

describe('setzeZielzeit', () => {
  it('trägt eine fehlende Zielzeit manuell nach', () => {
    let lauf = startAll(wettkampfLauf(), 0, 0)
    const bahn = lauf.bahnen[0]!
    lauf = setzeZielzeit(lauf, bahn.id, 59_990, 1234)

    const anschlag = lauf.bahnen[0]?.anschlaege[0]
    expect(anschlag?.istFinish).toBe(true)
    expect(anschlag?.splitMs).toBe(59_990)
    expect(anschlag?.manuell).toBe(true)
    expect(anschlag?.erfasstAt).toBe(1234)
  })

  it('korrigiert eine vorhandene Zielzeit ohne einen zweiten Anschlag', () => {
    let lauf = startAll(wettkampfLauf(), 0, 0)
    const bahn = lauf.bahnen[0]!
    lauf = tapLane(lauf, bahn.id, 60_000, 60_000)
    lauf = setzeZielzeit(lauf, bahn.id, 59_000)

    expect(lauf.bahnen[0]?.anschlaege).toHaveLength(1)
    expect(lauf.bahnen[0]?.anschlaege[0]?.splitMs).toBe(59_000)
    expect(lauf.bahnen[0]?.anschlaege[0]?.manuell).toBe(true)
  })

  it('lässt Trainingsläufe unangetastet', () => {
    const training = createLauf(
      { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' },
      [{ nummer: 1 }],
    )
    const bahn = training.bahnen[0]!
    expect(setzeZielzeit(training, bahn.id, 60_000)).toBe(training)
  })
})

describe('wettkampfFortschritt', () => {
  it('zählt gewertete Bahnen über mehrere Läufe', () => {
    let lauf = startAll(wettkampfLauf(), 0, 0)
    lauf = tapLane(lauf, lauf.bahnen[0]!.id, 60_000, 60_000)
    expect(wettkampfFortschritt([lauf])).toEqual({ fertig: 1, gesamt: 3 })
  })
})
