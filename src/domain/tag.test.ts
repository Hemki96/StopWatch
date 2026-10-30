/**
 * Tagesbezeichnungen: Lesen und Schreiben des Namens für ein Datum.
 *
 * Die Tests sichern die beiden Regeln, auf denen Verlauf und Analyse aufbauen:
 * Ein Tag hat den ersten nicht-leeren Namen seiner Sätze, und ein neuer Name
 * landet auf allen Sätzen desselben Datums.
 */
import { describe, expect, it } from 'vitest'
import { setzeTagesnamen, tagesnamen } from './tag'
import type { Satz } from './types'

/** Ein minimaler Satz; nur Datum und optionaler Tagesname sind relevant. */
function satz(id: string, datum: string, tagesbezeichnung?: string): Satz {
  return {
    id,
    datum,
    bezeichnung: id,
    ...(tagesbezeichnung === undefined ? {} : { tagesbezeichnung }),
    konfiguration: { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' },
    plan: null,
    erstelltAm: 0,
  }
}

describe('tagesnamen', () => {
  it('liefert je Datum den ersten nicht-leeren Namen', () => {
    const namen = tagesnamen([
      satz('a', '2026-10-27'),
      satz('b', '2026-10-27', 'Kader A'),
      satz('c', '2026-10-27', 'Kader B'),
      satz('d', '2026-10-28', 'Kader C'),
    ])

    expect(namen.get('2026-10-27')).toBe('Kader A')
    expect(namen.get('2026-10-28')).toBe('Kader C')
    expect(namen.size).toBe(2)
  })

  it('ignoriert leere Namen und Sätze ohne Datum', () => {
    const namen = tagesnamen([
      satz('a', '2026-10-27', '   '),
      satz('b', ''),
      satz('c', '', 'Ohne Tag'),
    ])

    expect(namen.size).toBe(0)
  })
})

describe('setzeTagesnamen', () => {
  it('setzt den Namen auf allen Sätzen des Tages und trimmt ihn', () => {
    const vorher = [
      satz('a', '2026-10-27'),
      satz('b', '2026-10-27', 'Alt'),
      satz('c', '2026-10-28', 'Anderer Tag'),
    ]

    const nachher = setzeTagesnamen(vorher, '2026-10-27', '  Kader A  ')

    expect(nachher.map((eintrag) => eintrag.tagesbezeichnung)).toEqual([
      'Kader A',
      'Kader A',
      'Anderer Tag',
    ])
    // Die Eingabe bleibt unverändert; nur die betroffenen Einträge sind neu.
    expect(vorher[0]?.tagesbezeichnung).toBeUndefined()
    expect(vorher[1]?.tagesbezeichnung).toBe('Alt')
    expect(nachher[2]).toBe(vorher[2])
  })

  it('entfernt den Namen bei leerer Eingabe', () => {
    const vorher = [satz('a', '2026-10-27', 'Kader A')]

    const nachher = setzeTagesnamen(vorher, '2026-10-27', '')

    expect(nachher[0]?.tagesbezeichnung).toBe('')
  })

  it('liefert dieselbe Liste, wenn sich nichts ändert', () => {
    const vorher = [satz('a', '2026-10-27', 'Kader A')]

    expect(setzeTagesnamen(vorher, '2026-10-27', ' Kader A ')).toBe(vorher)
    expect(setzeTagesnamen(vorher, '2026-10-28', 'Kader B')).toBe(vorher)
  })
})
