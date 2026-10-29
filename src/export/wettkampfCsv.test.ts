import { describe, expect, it } from 'vitest'
import { startAll, tapLane } from '../domain/lauf'
import { createWettkampf, createWettkampfLauf, createWettkampfSatz } from '../domain/wettkampf'
import type { Schwimmer } from '../domain/types'
import { wettkampfCsvDateiname, wettkampfErgebnisseAlsCsv } from './csv'

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

const schwimmer: Schwimmer[] = [
  { id: 'a', name: 'Anna', jahrgang: 2010, notiz: '', erstelltAm: 0 },
  { id: 'b', name: 'Ben', jahrgang: 2011, notiz: '', erstelltAm: 0 },
]

describe('wettkampfErgebnisseAlsCsv', () => {
  it('schreibt eine Zeile pro Start, gewertet nach Platz', () => {
    let lauf = createWettkampfLauf(
      satz,
      {
        nummer: 1,
        starts: [
          { name: 'Anna', bahn: 3 },
          { name: 'Ben', bahn: 4 },
        ],
      },
      (start) => (start.name === 'Anna' ? 'a' : 'b'),
    )
    lauf = startAll(lauf, 0, 0)
    lauf = tapLane(lauf, lauf.bahnen[0]!.id, 61_000, 61_000)
    lauf = tapLane(lauf, lauf.bahnen[1]!.id, 60_000, 60_000)

    const csv = wettkampfErgebnisseAlsCsv(wettkampf, [satz], [lauf], schwimmer)
    const zeilen = csv.replace(/^\uFEFF/, '').trim().split('\r\n')

    expect(zeilen[0]).toBe(
      'wettkampf;datum;disziplin;strecke_m;schwimmart;lauf;platz;bahn;schwimmer;zeit_ms;zeit_formatiert;status;manuell',
    )
    expect(zeilen[1]).toContain('Herbstpokal;2026-10-29;100 m Freistil;100;freistil;1;1;4;Ben;60000;01:00,00;Ziel;0')
    expect(zeilen[2]).toContain(';2;3;Anna;61000;01:01,00;Ziel;0')
  })

  it('hängt offene Bahnen mit Status offen an', () => {
    let lauf = createWettkampfLauf(
      satz,
      {
        nummer: 1,
        starts: [
          { name: 'Anna', bahn: 3 },
          { name: 'Ben', bahn: 4 },
        ],
      },
      (start) => (start.name === 'Anna' ? 'a' : 'b'),
    )
    lauf = startAll(lauf, 0, 0)
    lauf = tapLane(lauf, lauf.bahnen[0]!.id, 61_000, 61_000)

    const csv = wettkampfErgebnisseAlsCsv(wettkampf, [satz], [lauf], schwimmer)
    expect(csv).toContain(';1;3;Anna;61000;01:01,00;Ziel;0')
    expect(csv).toContain(';;4;Ben;;;offen;0')
  })

  it('benennt die Datei nach dem Wettkampfdatum', () => {
    expect(wettkampfCsvDateiname(wettkampf)).toBe('beckenrand-wettkampf-2026-10-29.csv')
  })
})
