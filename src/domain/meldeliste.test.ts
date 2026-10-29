/**
 * Toleranter CSV-Import für Meldelisten.
 *
 * Sichert ab, dass ein Wettkampfprogramm aus verschiedenen Quellen ohne Umbau
 * importierbar ist: deutsche und englische Spaltennamen, Semikolon, Komma oder
 * Tabulator, Kopfzeile oder Schnellformat, getrennte Vor- und Nachnamen sowie
 * Anführungszeichen. Gleichzeitig muss jeder echte Widerspruch (doppelte Bahn,
 * Strecke passt nicht zum Becken, fehlender Name) mit Zeilennummer abbrechen,
 * statt still einen halben Plan zu liefern.
 *
 * Es gibt keine Datei-Fixtures: Die CSV-Texte stehen als String im Test, damit
 * Trennzeichen und Zeilenumbrüche sichtbar bleiben. `vorgabe` entspricht den
 * Vorgaben des Import-Dialogs (50-m-Becken, 100 m Freistil).
 */
import { describe, expect, it } from 'vitest'
import { meldelisteZusammenfassung, parseMeldeliste } from './meldeliste'

// Vorgaben des Dialogs; sie greifen nur, wenn die Datei die Angabe nicht selbst
// enthält. 100 m passen zu einem 50-m-Becken (zwei Längen).
const vorgabe = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

// Vollständige Meldeliste: Gruppierung nach Disziplin und Lauf, Zählung der
// Starts und Erhalt der Jahrgänge.
describe('parseMeldeliste', () => {
  // 4 Starts in 3 Läufen: 100 m Freistil mit zwei Heats, 50 m Brust mit einem.
  // Anna und Ben starten im selben Heat, Clara im zweiten.
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

  // Zwei Spalten ohne Kopfzeile bedeuten „Bahn;Name“; Strecke und Schwimmart
  // kommen aus der Vorgabe (50 m Brust im 25-m-Becken, also zwei Längen).
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

  // Die Meldeliste wird zu einem Namen zusammengesetzt; so entsteht eine
  // eindeutige Zuordnung, obwohl zwei Spalten getrennt sind.
  it('setzt Vor- und Nachname aus getrennten Spalten zusammen', () => {
    const ergebnis = parseMeldeliste('bahn;vorname;nachname\n1;Anna;Muster\n2;Ben;Beispiel\n', vorgabe)
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.meldeliste.disziplinen[0]?.laeufe[0]?.starts.map((start) => start.name)).toEqual([
      'Anna Muster',
      'Ben Beispiel',
    ])
  })

  // Ohne Bahnspalte wird die erste freie Bahn vergeben; sie beginnt in jedem
  // Lauf wieder bei 1, damit Bahnnummern heizweise eindeutig sind.
  it('vergibt fehlende Bahnen der Reihe nach', () => {
    const ergebnis = parseMeldeliste('name;lauf\nAnna;1\nBen;1\nClara;2\n', vorgabe)
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    const laeufe = ergebnis.meldeliste.disziplinen[0]?.laeufe ?? []
    expect(laeufe[0]?.starts.map((start) => start.bahn)).toEqual([1, 2])
    expect(laeufe[1]?.starts[0]?.bahn).toBe(1)
  })

  // Disziplintext schlägt die Vorgaben: „200 m Rücken“ liefert Strecke und
  // Schwimmart, ohne dass eigene Spalten nötig sind.
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

  // Yard-Wettkämpfe lesen „100 yd“ und rechnen kanonisch in 91,44 m um. Ohne
  // Suffix gilt die Einheit des Wettkampfs.
  it('erkennt Yard-Angaben und die Einheit des Wettkampfs', () => {
    const yard = {
      beckenlaengeM: 22.86 as const,
      einheit: 'yd' as const,
      streckeM: 91.44,
      schwimmart: 'freistil' as const,
    }
    const mitSuffix = parseMeldeliste('disziplin;name\n100 yd Freistil;Anna\n', yard)
    expect(mitSuffix.ok).toBe(true)
    if (!mitSuffix.ok) return
    const disziplin = mitSuffix.meldeliste.disziplinen[0]!
    expect(disziplin.streckeM).toBe(91.44)
    expect(disziplin.einheit).toBe('yd')
    expect(disziplin.bezeichnung).toBe('100 yd Freistil')

    const ohneSuffix = parseMeldeliste('strecke;name\n100;Ben\n', yard)
    expect(ohneSuffix.ok).toBe(true)
    if (!ohneSuffix.ok) return
    expect(ohneSuffix.meldeliste.disziplinen[0]?.streckeM).toBe(91.44)
    expect(ohneSuffix.meldeliste.disziplinen[0]?.einheit).toBe('yd')
  })

  // Ein Meter-Eintrag in einem Yard-Wettkampf (und umgekehrt) wäre still falsch;
  // die Meldung nennt die Zeile und die erwartete Einheit.
  it('lehnt eine unpassende Einheit mit Zeilennummer ab', () => {
    const yard = {
      beckenlaengeM: 22.86 as const,
      einheit: 'yd' as const,
      streckeM: 91.44,
      schwimmart: 'freistil' as const,
    }
    const falsch = parseMeldeliste('disziplin;name\n100 m Freistil;Anna\n', yard)
    expect(falsch.ok).toBe(false)
    if (falsch.ok) return
    expect(falsch.fehler).toContain('Zeile 2')
    expect(falsch.fehler).toContain('passt nicht')
    expect(falsch.fehler).toContain('25 yd')
  })

  // Ein Semikolon innerhalb von Anführungszeichen ist Text, `""` ist ein
  // wörtliches Anführungszeichen; die Spaltenstruktur bleibt intakt.
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

  // Zwei Namen auf derselben Bahn würden später eine der beiden Zeiten
  // überschreiben; der Import bricht deshalb mit Bahnnummer ab.
  it('lehnt doppelte Bahnen in einem Lauf ab', () => {
    const ergebnis = parseMeldeliste('lauf;bahn;name\n1;3;Anna\n1;3;Ben\n', vorgabe)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('Bahn 3')
    expect(ergebnis.fehler).toContain('doppelt')
  })

  // 75 m sind kein Vielfaches der 50-m-Beckenlänge; die Meldung nennt die
  // konkrete Strecke, damit der Fehler in der Datei zu finden ist.
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

  // Die Zeilennummer bezieht sich auf die Datei: Kopfzeile ist Zeile 1, Anna
  // Zeile 2, der leere Name steht in Zeile 3.
  it('nennt die Zeile bei fehlendem Namen', () => {
    const ergebnis = parseMeldeliste('bahn;name\n1;Anna\n2;\n', vorgabe)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('Zeile 3')
    expect(ergebnis.fehler).toContain('Name')
  })

  // Eine einzelne Spalte ohne Kopfzeile ist eine reine Namensliste; die Bahnen
  // werden in Dateireihenfolge ab 1 vergeben.
  it('akzeptiert eine reine Namensliste mit einer Spalte', () => {
    const ergebnis = parseMeldeliste('name\nAnna\nBen\n', vorgabe)
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.meldeliste.disziplinen[0]?.laeufe[0]?.starts.map((start) => start.bahn)).toEqual([
      1, 2,
    ])
  })

  // Die Größenprüfung greift vor dem Split: Eine einzelne riesige Zeile darf
  // den Hauptthread nicht erst sekundenlang blockieren.
  it('lehnt zu großen Text ab, bevor er zerlegt wird', () => {
    const ergebnis = parseMeldeliste('x'.repeat(2_000_001), vorgabe)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('zu groß')
  })
})

// Die Vorschauzeile muss Singular und Plural unterscheiden; „Disziplin“ und
// „Lauf“ bekommen eigene Formen, „Start“ ebenfalls.
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
