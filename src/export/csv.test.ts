import { describe, expect, it } from 'vitest'
import { laeufeAlsCsv } from './csv'
import { createLauf, korrigiereAnschlag, startAll, tapLane } from '../domain/lauf'
import type { Lauf, Satz, Schwimmer } from '../domain/types'

const K100 = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

function laufMitZweiLaengen(): Lauf {
  let lauf = createLauf(K100, [{ nummer: 1, schwimmerId: 's1' }], 'satz-1')
  lauf = startAll(lauf, 0, Date.UTC(2026, 9, 29, 9, 30))
  const bahn = lauf.bahnen[0]!
  lauf = tapLane(lauf, bahn.id, 31_250, Date.UTC(2026, 9, 29, 9, 30, 31))
  lauf = tapLane(lauf, bahn.id, 64_000, Date.UTC(2026, 9, 29, 9, 31, 4))
  return lauf
}

const satz: Satz = {
  id: 'satz-1',
  datum: '2026-10-29',
  bezeichnung: 'Test; mit Semikolon',
  konfiguration: K100,
  plan: null,
  erstelltAm: 0,
}

const schwimmer: Schwimmer[] = [
  { id: 's1', name: 'Anna Beispiel', jahrgang: 2010, notiz: '', erstelltAm: 0 },
]

describe('laeufeAlsCsv', () => {
  it('schreibt eine Kopfzeile und eine Zeile pro Anschlag', () => {
    const csv = laeufeAlsCsv([laufMitZweiLaengen()], [satz], schwimmer)
    const zeilen = csv.replace(/^\uFEFF/, '').trim().split('\r\n')

    expect(zeilen).toHaveLength(3)
    expect(zeilen[0]).toBe(
      'satz;datum;beckenlaenge_m;strecke_m;schwimmart;bahn;schwimmer;laenge_nr;split_ms;split_formatiert;ist_finish;manuell;wiederholung;wiederholungen;takt_s;startversatz_ms',
    )
    expect(zeilen[1]).toContain('1;31250;00:31,25;0;0')
    expect(zeilen[2]).toContain('2;64000;01:04,00;1;0')
  })

  it('maskiert Semikolons und setzt ein BOM', () => {
    const csv = laeufeAlsCsv([laufMitZweiLaengen()], [satz], schwimmer)
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"Test; mit Semikolon"')
  })

  it('lässt Schwimmer ohne Zuordnung leer', () => {
    let lauf = createLauf(K100, [{ nummer: 1 }], 'satz-1')
    lauf = startAll(lauf, 0, Date.UTC(2026, 9, 29, 9, 30))
    const bahn = lauf.bahnen[0]!
    lauf = tapLane(lauf, bahn.id, 30_000, 0)
    lauf = tapLane(lauf, bahn.id, 61_000, 0)

    const csv = laeufeAlsCsv([lauf], [satz], schwimmer)
    expect(csv).toContain('1;;1;30000')
  })
})

describe('Formelschutz im CSV', () => {
  it('entschärft Zellen, die Excel als Formel ausführen würde', () => {
    const csv = laeufeAlsCsv(
      [laufMitZweiLaengen()],
      [{ ...satz, bezeichnung: '-Test' }],
      [{ ...schwimmer[0]!, name: '=1+1' }],
    )

    expect(csv).toContain("'-Test")
    expect(csv).toContain("'=1+1")
    expect(csv).not.toContain(';-Test')
    expect(csv).not.toContain(';=1+1')
  })
})

describe('manuelle Korrektur im CSV', () => {
  it('markiert korrigierte Anschläge in einer eigenen Spalte', () => {
    let lauf = createLauf(K100, [{ nummer: 1, schwimmerId: 's1' }], 'satz-1')
    lauf = startAll(lauf, 0, Date.UTC(2026, 9, 29, 9, 30))
    const bahn = lauf.bahnen[0]!
    lauf = tapLane(lauf, bahn.id, 31_250, 0)
    lauf = tapLane(lauf, bahn.id, 64_000, 0)
    lauf = korrigiereAnschlag(lauf, bahn.id, 1, 30_000)

    const csv = laeufeAlsCsv([lauf], [satz], schwimmer)
    expect(csv).toContain('1;30000;00:30,00;0;1')
    expect(csv).toContain('2;64000;01:04,00;1;0')
  })
})
