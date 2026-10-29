/**
 * Bestzeiten, Deltas und Pace.
 *
 * Sichert ab, dass ein PB nur aus einer vollständigen Zielzeit entsteht und je
 * Kombination aus Schwimmer, Strecke, Schwimmart und Beckenlänge gilt. Offene
 * Strecken, Bahnen ohne Schwimmer und Bahnen ohne Finish dürfen kein PB
 * erzeugen; Kurzbahn und Langbahn bleiben getrennt. `pbDelta` markiert die
 * schnellste Zeit als Bestzeit und liefert für langsamere Läufe einen positiven
 * Abstand.
 *
 * Die Läufe entstehen über den echten Zeitkern: `startAll` setzt den Start auf
 * 0 ms, die Tap-Zeiten sind kumulierte Splits. Im 50-m-Becken sind 100 m zwei
 * Längen, der zweite Tap ist also das Finish; die Wanduhr liegt konstant bei
 * 1_000 ms und spielt für die Auswertung keine Rolle.
 */
import { describe, expect, it } from 'vitest'
import { berechnePbs, pacePro100, pbDelta, pbKey } from './analyse'
import { createLauf, startAll, tapLane } from './lauf'
import type { Lauf, LaufKonfiguration } from './types'

// 100 m Freistil im 50-m-Becken als Referenz für alle PB-Schlüssel.
const K100 = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

// Baut einen Lauf aus kumulierten Splitzeiten je Bahn. `schwimmerIds` füllt die
// Bahnen der Reihe nach; fehlende Einträge bleiben ohne Zuordnung.
function baueLauf(
  konfiguration: LaufKonfiguration,
  bahnZeiten: number[][],
  schwimmerIds: (string | null)[] = [],
): Lauf {
  let lauf = createLauf(
    konfiguration,
    bahnZeiten.map((_, i) => ({ nummer: i + 1, schwimmerId: schwimmerIds[i] ?? null })),
  )
  lauf = startAll(lauf, 0, 1_000)
  bahnZeiten.forEach((zeiten, index) => {
    const bahn = lauf.bahnen[index]!
    for (const zeit of zeiten) {
      lauf = tapLane(lauf, bahn.id, zeit, 1_000 + zeit)
    }
  })
  return lauf
}

// Der Schlüssel trennt die Kombinationen, für die Bestzeiten getrennt gelten.
describe('pbKey', () => {
  // Kurzbahn und Langbahn sind nicht vergleichbar; 25 m und 50 m ergeben
  // deshalb verschiedene Schlüssel.
  it('trennt Kurzbahn und Langbahn', () => {
    const kurz = pbKey({ ...K100, beckenlaengeM: 25 }, 's1')
    const lang = pbKey({ ...K100, beckenlaengeM: 50 }, 's1')
    expect(kurz).not.toBe(lang)
  })

  // Meter- und Yard-Becken sind getrennte Bestzeiten, auch wenn die
  // kanonische Länge gleich wäre.
  it('trennt Meter- und Yard-Becken', () => {
    const meter = pbKey({ ...K100, beckenlaengeM: 25 }, 's1')
    const yard = pbKey(
      { beckenlaengeM: 22.86, streckeM: 91.44, schwimmart: 'freistil', einheit: 'yd' },
      's1',
    )
    expect(meter).not.toBe(yard)
  })

  // Strecke und Schwimmart sind eigene Dimensionen des Schlüssels.
  it('trennt Strecke und Schwimmart', () => {
    expect(pbKey(K100, 's1')).not.toBe(pbKey({ ...K100, streckeM: 200 }, 's1'))
    expect(pbKey(K100, 's1')).not.toBe(pbKey({ ...K100, schwimmart: 'brust' }, 's1'))
  })
})

// `berechnePbs` ist eine Momentaufnahme über die übergebenen Läufe und nimmt je
// Schlüssel das Minimum.
describe('berechnePbs', () => {
  // Beide Läufe gehören zu s1; 62_000 ms schlagen 65_000 ms, der Verweis zeigt
  // auf den schnelleren Lauf.
  it('nimmt die schnellste vollständige Zeit je Kombination', () => {
    const langsam = baueLauf(K100, [[30_000, 65_000]], ['s1'])
    const schnell = baueLauf(K100, [[29_000, 62_000]], ['s1'])
    const pbs = berechnePbs([langsam, schnell])

    const eintrag = pbs.get(pbKey(K100, 's1'))
    expect(eintrag?.ms).toBe(62_000)
    expect(eintrag?.laufId).toBe(schnell.id)
  })

  // Ein einzelner Anschlag ist noch kein Finish; ohne Schwimmer fehlt der
  // Bezug. Beides erzeugt keinen Eintrag.
  it('ignoriert Bahnen ohne Finish und ohne Schwimmer', () => {
    const unvollstaendig = baueLauf(K100, [[30_000]], ['s1'])
    const ohneSchwimmer = baueLauf(K100, [[30_000, 60_000]], [null])
    expect(berechnePbs([unvollstaendig, ohneSchwimmer]).size).toBe(0)
  })

  // Bei offener Strecke gibt es keine feste Distanz und damit kein PB.
  it('ignoriert offene Strecken', () => {
    const offen = baueLauf({ ...K100, streckeM: null }, [[30_000, 60_000]], ['s1'])
    expect(berechnePbs([offen]).size).toBe(0)
  })
})

// Delta gegen die gespeicherte Bestzeit: 0 ms und `istPb` für den schnellsten
// Lauf, positiver Abstand für den langsameren.
describe('pbDelta', () => {
  it('erkennt eine neue Bestzeit', () => {
    const alt = baueLauf(K100, [[30_000, 65_000]], ['s1'])
    const neu = baueLauf(K100, [[29_000, 62_000]], ['s1'])
    const pbs = berechnePbs([alt, neu])

    const delta = pbDelta(pbs, neu, neu.bahnen[0]!)
    expect(delta).toEqual({ deltaMs: 0, istPb: true })

    const altDelta = pbDelta(pbs, alt, alt.bahnen[0]!)
    expect(altDelta).toEqual({ deltaMs: 3_000, istPb: false })
  })
})

// Pace normalisiert auf 100 m: 1:00 auf 100 m und 2:00 auf 200 m sind beide
// 60 s pro 100 m.
describe('pacePro100', () => {
  it('rechnet auf 100 m um', () => {
    expect(pacePro100(60_000, 100)).toBe(60_000)
    expect(pacePro100(120_000, 200)).toBe(60_000)
  })
})

// ---------------------------------------------------------------------------
// Analyse: Längenzeiten, Matrix, Referenz und Drill-down
// ---------------------------------------------------------------------------

import {
  abweichungZurVorrunde,
  analyseMatrix,
  analyseRunden,
  istAnalyseSatz,
  laengenMatrix,
  laengenZeiten,
  letzterGleicherSatz,
  mittlereAbweichungen,
} from './analyse'
import type { Satz, SatzPlan } from './types'

/** Ein Satz mit fester Konfiguration; `plan` macht daraus eine Serie. */
function satz(
  id: string,
  optionen: { datum?: string; plan?: SatzPlan | null; erstelltAm?: number } = {},
): Satz {
  return {
    id,
    datum: optionen.datum ?? '2026-10-29',
    bezeichnung: id,
    konfiguration: K100,
    plan: optionen.plan ?? null,
    erstelltAm: optionen.erstelltAm ?? 0,
  }
}

/** Eine Runde eines Satzes aus kumulierten Splitzeiten je Bahn. */
function runde(
  satzId: string,
  wiederholung: number | null,
  bahnZeiten: number[][],
  schwimmerIds: (string | null)[] = [],
): Lauf {
  let lauf = createLauf(
    K100,
    bahnZeiten.map((_, i) => ({ nummer: i + 1, schwimmerId: schwimmerIds[i] ?? null })),
    satzId,
    { wiederholung },
  )
  lauf = startAll(lauf, 0, 1_000)
  bahnZeiten.forEach((zeiten, index) => {
    const bahn = lauf.bahnen[index]!
    for (const zeit of zeiten) lauf = tapLane(lauf, bahn.id, zeit, 1_000 + zeit)
  })
  return lauf
}

describe('laengenZeiten', () => {
  it('leitet die Längenzeit aus den kumulierten Splits ab', () => {
    const lauf = runde('s1', 1, [[30_000, 61_000]])
    const laengen = laengenZeiten(lauf.bahnen[0]!)
    expect(laengen.map((laenge) => laenge.zeitMs)).toEqual([30_000, 31_000])
    expect(laengen.map((laenge) => laenge.kumuliertMs)).toEqual([30_000, 61_000])
    expect(laengen.every((laenge) => laenge.manuell === false)).toBe(true)
  })
})

describe('analyseRunden', () => {
  it('sortiert Serienrunden nach Wiederholungsnummer', () => {
    const gefaelscht = satz('s1', { plan: { wiederholungen: 2, taktSek: 60, startversatzMs: 0 } })
    const laeufe = [runde('s1', 2, [[60_000, 120_000]]), runde('s1', 1, [[61_000, 122_000]])]
    expect(analyseRunden(gefaelscht, laeufe).map((lauf) => lauf.wiederholung)).toEqual([1, 2])
  })

  it('sortiert freie Sätze nach Startzeit', () => {
    const frei = satz('s1')
    const spaet = { ...runde('s1', null, [[61_000, 122_000]]), startWallMs: 2000 }
    const frueh = { ...runde('s1', null, [[60_000, 120_000]]), startWallMs: 1000 }
    expect(analyseRunden(frei, [spaet, frueh]).map((lauf) => lauf.startWallMs)).toEqual([1000, 2000])
  })
})

describe('istAnalyseSatz', () => {
  it('nimmt Trainingssätze mit Splits und lässt Wettkämpfe aus', () => {
    const training = satz('t1')
    expect(istAnalyseSatz(training, [runde('t1', 1, [[30_000, 60_000]])])).toBe(true)

    const wettkampfSatz = { ...satz('w1'), wettkampfId: 'wk1' }
    expect(istAnalyseSatz(wettkampfSatz, [runde('w1', 1, [[30_000, 60_000]])])).toBe(false)

    const ohneSplits = satz('leer')
    expect(istAnalyseSatz(ohneSplits, [])).toBe(false)
  })
})

describe('letzterGleicherSatz', () => {
  const plan = { wiederholungen: 2, taktSek: 120, startversatzMs: 0 }
  const laeufe = [
    runde('alt', 1, [[30_000, 60_000]]),
    runde('alt', 2, [[30_000, 61_000]]),
    runde('neu', 1, [[30_000, 59_000]]),
    runde('neu', 2, [[30_000, 60_000]]),
  ]

  it('findet denselben Satz vor dem aktuellen, unabhängig vom Takt', () => {
    const alt = satz('alt', { datum: '2026-10-22', plan, erstelltAm: 1 })
    const neu = satz('neu', { datum: '2026-10-29', plan, erstelltAm: 2 })
    expect(letzterGleicherSatz(neu, [alt, neu], laeufe)?.id).toBe('alt')
    expect(letzterGleicherSatz(alt, [alt, neu], laeufe)).toBeNull()
  })

  it('verlangt gleiche Rundenzahl, Strecke, Schwimmart und Beckenlänge', () => {
    const neu = satz('neu', { datum: '2026-10-29', plan, erstelltAm: 2 })
    const anders = satz('anders', {
      datum: '2026-10-22',
      plan: { ...plan, wiederholungen: 3 },
      erstelltAm: 1,
    })
    expect(letzterGleicherSatz(neu, [anders, neu], laeufe)).toBeNull()

    const andererKurs = {
      ...satz('kurs', { datum: '2026-10-22', plan, erstelltAm: 1 }),
      konfiguration: { ...K100, beckenlaengeM: 25 as const },
    }
    expect(letzterGleicherSatz(neu, [andererKurs, neu], laeufe)).toBeNull()
  })

  it('überspringt offene Strecken und Wettkämpfe', () => {
    const offen = {
      ...satz('offen', { datum: '2026-10-22', erstelltAm: 1 }),
      konfiguration: { ...K100, streckeM: null },
    }
    const neu = satz('neu', { datum: '2026-10-29', plan, erstelltAm: 2 })
    expect(letzterGleicherSatz(neu, [offen, neu], laeufe)).toBeNull()
  })
})

describe('analyseMatrix', () => {
  const plan = { wiederholungen: 2, taktSek: 120, startversatzMs: 0 }
  const aktuell = satz('neu', { plan })
  const laeufe = [
    runde('neu', 1, [[30_000, 60_000], [30_000, 61_000]], ['a', 'b']),
    runde('neu', 2, [[30_000, 59_000], [30_000, 63_000]], ['a', 'b']),
  ]
  const referenz = [runde('alt', 1, [[30_000, 58_000]], ['a'])]

  it('zeigt Abweichung zur Vorrunde und markiert die schnellste Zeit', () => {
    const matrix = analyseMatrix(analyseRunden(aktuell, laeufe), referenz)
    expect(matrix.zeilen.map((zeile) => zeile.nummer)).toEqual([1, 2])
    expect(matrix.zeilen[0]?.zellen.map((zelle) => zelle?.abweichungMs)).toEqual([null, -1000])
    expect(matrix.zeilen[1]?.zellen.map((zelle) => zelle?.abweichungMs)).toEqual([null, 2000])
    expect(matrix.schnellsteJeRunde).toEqual([60_000, 59_000])
    expect(matrix.zeilen[0]?.zellen.map((zelle) => zelle?.istSchnellste)).toEqual([true, true])
    expect(matrix.zeilen[1]?.zellen.map((zelle) => zelle?.istSchnellste)).toEqual([false, false])
  })

  it('füllt die Spalte „zuletzt“ nur für bekannte Personen', () => {
    const matrix = analyseMatrix(analyseRunden(aktuell, laeufe), referenz)
    expect(matrix.zeilen[0]?.letzteMs).toBe(58_000)
    expect(matrix.zeilen[1]?.letzteMs).toBeNull()
  })

  it('markiert unvollständige und korrigierte Zellen', () => {
    const offen = runde('neu', 2, [[30_000, 59_000], [30_000, 63_000]], ['a', 'b'])
    // Bahn 2 der zweiten Runde verliert den letzten Anschlag: gestartet, aber
    // ohne Finish.
    const unvollstaendig = {
      ...offen,
      bahnen: offen.bahnen.map((bahn, index) =>
        index === 1 ? { ...bahn, anschlaege: bahn.anschlaege.slice(0, 1) } : bahn,
      ),
    }
    const matrix = analyseMatrix([laeufe[0]!, unvollstaendig])
    expect(matrix.zeilen[1]?.zellen[1]?.unvollstaendig).toBe(true)
    expect(matrix.zeilen[1]?.zellen[1]?.ms).toBeNull()
  })
})

describe('laengenMatrix', () => {
  it('zeigt Längenzeiten je Runde inklusive Abweichung', () => {
    const laeufe = [
      runde('neu', 1, [[30_000, 60_000]]),
      runde('neu', 2, [[29_000, 61_000]]),
    ]
    const matrix = laengenMatrix(laeufe, 0)
    expect(matrix.zeilen.map((zeile) => zeile.meter)).toEqual([50, 100])
    expect(matrix.zeilen[0]?.zellen.map((zelle) => zelle?.zeitMs)).toEqual([30_000, 29_000])
    expect(matrix.zeilen[0]?.zellen.map((zelle) => zelle?.abweichungMs)).toEqual([null, -1000])
    expect(matrix.zeilen[1]?.zellen.map((zelle) => zelle?.abweichungMs)).toEqual([null, 2000])
  })
})

describe('abweichungZurVorrunde', () => {
  it('berechnet nur ab Runde 2 und nur mit beiden Zielzeiten', () => {
    const laeufe = [
      runde('s1', 1, [[30_000, 60_000]]),
      runde('s1', 2, [[30_000, 58_000]]),
    ]
    expect(abweichungZurVorrunde(laeufe, 0, 1)).toBeNull()
    expect(abweichungZurVorrunde(laeufe, 0, 2)).toBe(-2000)
    expect(abweichungZurVorrunde(laeufe, 0, 3)).toBeNull()
  })
})

describe('mittlereAbweichungen', () => {
  it('mittelt die Abweichungen der Personen je Runde', () => {
    const laeufe = [
      runde('s1', 1, [[30_000, 60_000], [30_000, 62_000]]),
      runde('s1', 2, [[30_000, 59_000], [30_000, 64_000]]),
    ]
    const mittel = mittlereAbweichungen(laeufe)
    expect(mittel[0]).toEqual({ runde: 1, mittelMs: null, anzahl: 0 })
    expect(mittel[1]).toEqual({ runde: 2, mittelMs: 500, anzahl: 2 })
  })
})
