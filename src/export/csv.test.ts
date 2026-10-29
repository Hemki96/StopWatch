/**
 * CSV-Export der Trainingszeiten.
 *
 * Sichert das Langformat ab: eine Kopfzeile, danach eine Zeile pro Anschlag mit
 * stabiler Spaltenreihenfolge, UTF-8-BOM und CRLF. Wichtige Regressionsfälle
 * sind das Maskieren von Semikolons in Bezeichnungen, der Formelschutz für
 * Zellen, die Excel als Formel ausführen würde, die leere Schwimmerzelle ohne
 * Zuordnung und die eigene Spalte `manuell` für korrigierte Anschläge.
 *
 * Die Fixture nutzt bewusst feste Wanduhrzeiten (29.10.2026, 09:30 UTC), damit
 * das lokale Datum in der CSV reproduzierbar ist. 31_250 ms und 64_000 ms sind
 * kumulierte Splits im 100-m-Lauf; der zweite ist das Finish. Die
 * Satzbezeichnung „Test; mit Semikolon“ prüft das Quoting, ohne dass ein
 * zusätzlicher Testfall nötig ist.
 */
import { describe, expect, it } from 'vitest'
import { laeufeAlsCsv } from './csv'
import { createLauf, korrigiereAnschlag, startAll, tapLane } from '../domain/lauf'
import type { Lauf, Satz, Schwimmer } from '../domain/types'

// 100 m im 50-m-Becken: zwei Anschläge ergeben Zwischenzeit und Ziel.
const K100 = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

// Fester Start (09:30 UTC) und zwei Anschläge; die Wanduhrwerte dienen nur der
// Datumsableitung, die Messung selbst kommt aus den `now`-Werten.
function laufMitZweiLaengen(): Lauf {
  let lauf = createLauf(K100, [{ nummer: 1, schwimmerId: 's1' }], 'satz-1')
  lauf = startAll(lauf, 0, Date.UTC(2026, 9, 29, 9, 30))
  const bahn = lauf.bahnen[0]!
  lauf = tapLane(lauf, bahn.id, 31_250, Date.UTC(2026, 9, 29, 9, 30, 31))
  lauf = tapLane(lauf, bahn.id, 64_000, Date.UTC(2026, 9, 29, 9, 31, 4))
  return lauf
}

// Die Bezeichnung enthält den Trenner und muss deshalb in Anführungszeichen
// stehen; das prüft das Quoting im selben Durchlauf.
const satz: Satz = {
  id: 'satz-1',
  datum: '2026-10-29',
  bezeichnung: 'Test; mit Semikolon',
  konfiguration: K100,
  plan: null,
  erstelltAm: 0,
}

// Der Schwimmer wird über `schwimmerId` aufgelöst; die Liste enthält genau den
// einen Namen für s1.
const schwimmer: Schwimmer[] = [
  { id: 's1', name: 'Anna Beispiel', jahrgang: 2010, notiz: '', erstelltAm: 0 },
]

// Grundformat: Kopfzeile plus eine Zeile pro Anschlag, unabhängig von der Zahl
// der Läufe.
describe('laeufeAlsCsv', () => {
  // Zwei Anschläge ergeben drei Zeilen. Der zweite Anschlag trägt
  // `ist_finish = 1`; die Spalte `manuell` bleibt in beiden Fällen 0.
  it('schreibt eine Kopfzeile und eine Zeile pro Anschlag', () => {
    const csv = laeufeAlsCsv([laufMitZweiLaengen()], [satz], schwimmer)
    const zeilen = csv.replace(/^\uFEFF/, '').trim().split('\r\n')

    expect(zeilen).toHaveLength(3)
    expect(zeilen[0]).toBe(
      'satz;datum;beckenlaenge_m;einheit;strecke_m;strecke;schwimmart;reihe;bahn;schwimmer;laenge_nr;split_ms;split_formatiert;ist_finish;manuell;wiederholung;wiederholungen;takt_s;startversatz_ms',
    )
    expect(zeilen[1]).toContain('1;31250;00:31,25;0;0')
    expect(zeilen[2]).toContain('2;64000;01:04,00;1;0')
  })

  // Das BOM hilft deutschem Excel bei der UTF-8-Erkennung; der Trenner in der
  // Bezeichnung wird durch Anführungszeichen maskiert.
  it('maskiert Semikolons und setzt ein BOM', () => {
    const csv = laeufeAlsCsv([laufMitZweiLaengen()], [satz], schwimmer)
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"Test; mit Semikolon"')
  })

  // Ein Yard-Lauf weist Strecke und Einheit eindeutig aus: `strecke_m` bleibt
  // kanonisch (91,44), `strecke` ist die Anzeige (100), `einheit` ist `yd`.
  it('schreibt Strecke und Einheit für Yard-Läufe', () => {
    const konfiguration = {
      beckenlaengeM: 22.86 as const,
      streckeM: 91.44,
      schwimmart: 'freistil' as const,
      einheit: 'yd' as const,
    }
    let lauf = createLauf(konfiguration, [{ nummer: 1 }])
    lauf = startAll(lauf, 0, Date.UTC(2026, 9, 29, 9, 30))
    const bahn = lauf.bahnen[0]!
    lauf = tapLane(lauf, bahn.id, 30_000, 0)
    lauf = tapLane(lauf, bahn.id, 61_000, 0)

    const csv = laeufeAlsCsv([lauf], [], schwimmer)
    expect(csv).toContain(';22.86;yd;91.44;100;freistil;')
  })

  // Ohne `schwimmerId` bleibt die Namensspalte leer; die Bahnnummer bleibt
  // erhalten, damit die Zeile zuordenbar ist.
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

// Formelschutz: Zellen mit `=`, `+`, `-` oder `@` am Anfang bekommen ein
// führendes Apostroph, damit Excel sie als Text behandelt.
describe('Formelschutz im CSV', () => {
  // Bezeichnung `-Test` und Name `=1+1` sind Nutzereingaben. Geprüft wird
  // beides: das Apostroph ist da, und der rohe Wert steht nirgends direkt hinter
  // einem Trenner.
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

// Korrekturen sind sichtbar: Der korrigierte Anschlag trägt `manuell = 1`, der
// unveränderte Finish-Anschlag bleibt bei 0.
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
