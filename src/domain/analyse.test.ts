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
