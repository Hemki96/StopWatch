import { describe, expect, it } from 'vitest'
import { meldelisteZusammenfassung, parseMeldeliste } from './meldeliste'

const vorgabe = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

describe('parseMeldeliste', () => {
  it('liest eine vollständige Meldeliste mit Kopfzeile', () => {
    const ergebnis = parseMeldeliste(
      [
        'disziplin;strecke_m;schwimmart;lauf;bahn;name;jahrgang',
        '100 m Freistil;100;freistil;1;3;Anna Muster;2010',
        '100 m Freistil;100;freistil;1;4;Ben Beispiel;2011',
        '100 m Freistil;100;freistil;2;3;Clara Muster;2010',
        '50 m Brust;50;brust;1;1;Dana Beispiel;2012',
      ].join('\n'),
      vorgabe,
    )

    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.meldeliste.disziplinen).toHaveLength(2)
    expect(ergebnis.meldeliste.anzahlStarts).toBe(4)
    expect(ergebnis.meldeliste.anzahlLaeufe).toBe(3)

    const freistil = ergebnis.meldeliste.disziplinen[0]!
    expect(freistil.streckeM).toBe(100)
    expect(freistil.schwimmart).toBe('freistil')
    expect(freistil.laeufe).toHaveLength(2)
    expect(freistil.laeufe[0]?.starts.map((start) => start.name)).toEqual([
      'Anna Muster',
      'Ben Beispiel',
    ])
    expect(freistil.laeufe[0]?.starts[0]?.jahrgang).toBe(2010)
  })

  it('versteht das Schnellformat Bahn;Name ohne Kopfzeile', () => {
    const ergebnis = parseMeldeliste('1;Anna\n2;Ben\n', {
      beckenlaengeM: 25,
      streckeM: 50,
      schwimmart: 'brust',
    })
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.meldeliste.disziplinen[0]?.laeufe[0]?.starts).toHaveLength(2)
    expect(ergebnis.meldeliste.disziplinen[0]?.streckeM).toBe(50)
    expect(ergebnis.meldeliste.disziplinen[0]?.schwimmart).toBe('brust')
  })

  it('setzt Vor- und Nachname aus getrennten Spalten zusammen', () => {
    const ergebnis = parseMeldeliste('bahn;vorname;nachname\n1;Anna;Muster\n2;Ben;Beispiel\n', vorgabe)
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.meldeliste.disziplinen[0]?.laeufe[0]?.starts.map((start) => start.name)).toEqual([
      'Anna Muster',
      'Ben Beispiel',
    ])
  })

  it('vergibt fehlende Bahnen der Reihe nach', () => {
    const ergebnis = parseMeldeliste('name;lauf\nAnna;1\nBen;1\nClara;2\n', vorgabe)
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    const laeufe = ergebnis.meldeliste.disziplinen[0]?.laeufe ?? []
    expect(laeufe[0]?.starts.map((start) => start.bahn)).toEqual([1, 2])
    expect(laeufe[1]?.starts[0]?.bahn).toBe(1)
  })

  it('erkennt Schwimmart und Strecke aus der Disziplin', () => {
    const ergebnis = parseMeldeliste('disziplin;name\n200 m Rücken;Anna\n', {
      beckenlaengeM: 25,
      streckeM: 100,
      schwimmart: 'freistil',
    })
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.meldeliste.disziplinen[0]?.streckeM).toBe(200)
    expect(ergebnis.meldeliste.disziplinen[0]?.schwimmart).toBe('ruecken')
  })

  it('liest Semikolons und Anführungszeichen in Namen', () => {
    const ergebnis = parseMeldeliste(
      'bahn;name\n1;"Muster; Anna"\n2;"Beispiel, ""Ben"""\n',
      vorgabe,
    )
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.meldeliste.disziplinen[0]?.laeufe[0]?.starts.map((start) => start.name)).toEqual([
      'Muster; Anna',
      'Beispiel, "Ben"',
    ])
  })

  it('lehnt doppelte Bahnen in einem Lauf ab', () => {
    const ergebnis = parseMeldeliste('lauf;bahn;name\n1;3;Anna\n1;3;Ben\n', vorgabe)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('Bahn 3')
    expect(ergebnis.fehler).toContain('doppelt')
  })

  it('lehnt eine Strecke ab, die nicht zur Beckenlänge passt', () => {
    const ergebnis = parseMeldeliste('strecke_m;name\n75;Anna\n', {
      beckenlaengeM: 50,
      streckeM: 100,
      schwimmart: 'freistil',
    })
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('75 m')
  })

  it('nennt die Zeile bei fehlendem Namen', () => {
    const ergebnis = parseMeldeliste('bahn;name\n1;Anna\n2;\n', vorgabe)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('Zeile 3')
    expect(ergebnis.fehler).toContain('Name')
  })

  it('akzeptiert eine reine Namensliste mit einer Spalte', () => {
    const ergebnis = parseMeldeliste('name\nAnna\nBen\n', vorgabe)
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.meldeliste.disziplinen[0]?.laeufe[0]?.starts.map((start) => start.bahn)).toEqual([
      1, 2,
    ])
  })
})

describe('meldelisteZusammenfassung', () => {
  it('formatiert Singular und Plural', () => {
    expect(
      meldelisteZusammenfassung({
        disziplinen: [
          {
            bezeichnung: '100 m Freistil',
            streckeM: 100,
            schwimmart: 'freistil',
            laeufe: [{ nummer: 1, starts: [{ name: 'Anna', bahn: 1 }] }],
          },
        ],
        anzahlStarts: 1,
        anzahlLaeufe: 1,
        warnungen: [],
      }),
    ).toBe('1 Disziplin, 1 Lauf, 1 Start')
  })
})
