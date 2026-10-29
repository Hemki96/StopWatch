/**
 * Memoisierung der Satz-Auswertung (#68).
 *
 * Die Tests prüfen den Seam, den der Screen benutzt: Ein unveränderter Bestand
 * liefert beim nächsten Aufruf dasselbe Ergebnisobjekt (keine Neuberechnung),
 * ein ersetzter Lauf ein neues. Das gilt für die Listenkennzahlen, die Matrix
 * samt Referenzsatz und den Drill-down. Die Läufe entstehen über den echten
 * Zeitkern, damit die Erwartungen dieselben Werte wie in `domain/analyse` haben.
 */
import { describe, expect, it } from 'vitest'
import { createLauf, startAll, tapLane } from '../domain/lauf'
import type { Lauf, Satz, SatzPlan } from '../domain/types'
import { kennzahlenFuerSatz, matrixFuerSatz, personFuerSatz } from './analyseMemo'

const K100 = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const
const PLAN: SatzPlan = { wiederholungen: 2, taktSek: 120, startversatzMs: 0 }

/** Ein Satz mit zwei geplanten Runden und einer festen Person auf Bahn 1. */
function satz(id: string, datum: string): Satz {
  return {
    id,
    datum,
    bezeichnung: id,
    konfiguration: { ...K100 },
    plan: { ...PLAN },
    erstelltAm: 0,
  }
}

/** Eine Runde des Satzes aus kumulierten Splitzeiten. */
function runde(satzId: string, wiederholung: number, zeiten: number[]): Lauf {
  let lauf = createLauf(K100, [{ nummer: 1, schwimmerId: 'a' }], satzId, { wiederholung })
  lauf = startAll(lauf, 0, 1_000)
  const bahnId = lauf.bahnen[0]!.id
  for (const zeit of zeiten) lauf = tapLane(lauf, bahnId, zeit, 1_000 + zeit)
  return lauf
}

describe('kennzahlenFuerSatz', () => {
  it('liefert bei unveränderten Läufen dasselbe Ergebnis', () => {
    const aktuell = satz('s1', '2026-10-29')
    const laeufe = [
      runde('s1', 1, [30_000, 60_000]),
      runde('s1', 2, [30_000, 61_500]),
    ]

    const erst = kennzahlenFuerSatz(aktuell, laeufe)
    // Neues Array, dieselben Lauf-Objekte: so sieht ein reiner Render aus,
    // wenn nur lokaler Screen-State wechselt.
    const zweit = kennzahlenFuerSatz(aktuell, [...laeufe])

    expect(zweit).toBe(erst)
    expect(zweit.abweichungen).toEqual([{ runde: 2, mittelMs: 1_500, anzahl: 1 }])
  })

  it('rechnet nach einem geänderten Lauf neu', () => {
    const aktuell = satz('s1', '2026-10-29')
    const ersteRunde = runde('s1', 1, [30_000, 60_000])
    const zweiteRunde = runde('s1', 2, [30_000, 61_500])
    const erst = kennzahlenFuerSatz(aktuell, [ersteRunde, zweiteRunde])

    // Der Provider ersetzt genau den geänderten Lauf; die anderen bleiben
    // identisch. 59_000 statt 61_500 macht die Abweichung negativ.
    const geaendert = runde('s1', 2, [30_000, 59_000])
    const neu = kennzahlenFuerSatz(aktuell, [ersteRunde, geaendert])

    expect(neu).not.toBe(erst)
    expect(neu.abweichungen[0]?.mittelMs).toBe(-1_000)
    expect(neu.runden[1]).toBe(geaendert)
  })
})

describe('matrixFuerSatz', () => {
  it('rechnet bei unveränderten Läufen nicht neu', () => {
    const alt = satz('alt', '2026-10-22')
    const neu = satz('neu', '2026-10-29')
    const laeufe = [
      runde('alt', 1, [30_000, 58_000]),
      runde('alt', 2, [30_000, 58_500]),
      runde('neu', 1, [30_000, 60_000]),
      runde('neu', 2, [30_000, 61_000]),
    ]

    const erst = matrixFuerSatz(neu, [alt, neu], laeufe)
    const zweit = matrixFuerSatz(neu, [alt, neu], [...laeufe])

    expect(zweit).toBe(erst)
    expect(erst.referenz?.id).toBe('alt')
    expect(erst.anzahlRunden).toBe(2)
    expect(erst.matrix.zeilen[0]?.letzteMs).toBe(58_500)
  })

  it('übernimmt eine Änderung im Referenzsatz', () => {
    const alt = satz('alt', '2026-10-22')
    const neu = satz('neu', '2026-10-29')
    const altErste = runde('alt', 1, [30_000, 58_000])
    const altZweite = runde('alt', 2, [30_000, 58_500])
    const neuRunden = [runde('neu', 1, [30_000, 60_000]), runde('neu', 2, [30_000, 61_000])]

    const erst = matrixFuerSatz(neu, [alt, neu], [altErste, altZweite, ...neuRunden])
    // Nur die letzte Runde des Referenzsatzes ändert sich; die Spalte
    // „zuletzt“ muss den neuen Wert zeigen, nicht den memoisierten alten.
    const altGeaendert = runde('alt', 2, [30_000, 57_000])
    const geaendert = matrixFuerSatz(neu, [alt, neu], [altErste, altGeaendert, ...neuRunden])

    expect(geaendert).not.toBe(erst)
    expect(geaendert.matrix.zeilen[0]?.letzteMs).toBe(57_000)
  })
})

describe('personFuerSatz', () => {
  it('liefert stabile Längenzeiten und aktualisiert die Live-Abweichung', () => {
    const aktuell = satz('neu', '2026-10-29')
    const erste = runde('neu', 1, [30_000, 60_000])
    const zweite = runde('neu', 2, [30_000, 61_000])
    const laeufe = [erste, zweite]

    const erst = personFuerSatz(aktuell, 0, laeufe)
    expect(personFuerSatz(aktuell, 0, [...laeufe])).toBe(erst)
    expect(erst.live).toBe(1_000)

    // Eine geänderte Runde ergibt eine neue Auswertung derselben Person.
    const geaendert = runde('neu', 2, [30_000, 59_000])
    const neu = personFuerSatz(aktuell, 0, [erste, geaendert])

    expect(neu).not.toBe(erst)
    expect(neu.live).toBe(-1_000)
    expect(neu.matrix.zeilen[1]?.zellen[1]?.zeitMs).toBe(29_000)
  })
})
