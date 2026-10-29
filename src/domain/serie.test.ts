/**
 * Serienansicht: Runden, Zeile pro Schwimmer und Planprüfung.
 *
 * Sichert ab, dass mehrere `Lauf`-Wiederholungen eines Satzes zu genau einer
 * Zeile pro Bahn verdichtet werden und dass der Status die Überlappung zweier
 * Runden sichtbar macht (`ueberfaellig`) statt sie zu verstecken. Wichtige
 * Regressionsfälle sind die Auswahl der ältesten offenen Runde beim Tippen, die
 * Sortierung nach Wiederholungsnummer und `letzterAnschlag`, das nach der
 * tatsächlichen Bedienreihenfolge (`erfasstAt`) statt nach Rundennummer
 * entscheidet.
 *
 * Die Fixtures entstehen aus dem echten Zeitkern: `serie` plant alle Runden im
 * Takt von 120 s mit 10 s Startversatz voraus, `beende` setzt zwei Anschläge
 * (Zwischenzeit und Ziel). Es gibt keine Timer, alle Zeiten sind feste `now`.
 */
import { describe, expect, it } from 'vitest'
import { createLauf, planeLauf, tapLane } from './lauf'
import {
  aktuelleRunde,
  bahnZeile,
  istSerie,
  letzterAnschlag,
  naechsteWiederholung,
  pruefeSeriePlan,
  runden,
  serieFortschritt,
  warnungSeriePlan,
  zeilenZeit,
} from './serie'
import type { Lauf, Satz } from './types'

// 100 m im 50-m-Becken: zwei Längen, damit `beende` ein Finish erzeugen kann.
const K100 = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

// Erzeugt die Wiederholungen einer Serie. Jede Runde startet `taktMs` nach der
// vorigen, der Startversatz gilt innerhalb der Runde; 120 s Takt und 10 s
// Versatz entsprechen dem Beispiel „5×100 alle 2:00“ aus dem README.
function serie(anzahl = 3, taktMs = 120_000, versatzMs = 10_000, bahnen = 1): Lauf[] {
  return Array.from({ length: anzahl }, (_, index) =>
    planeLauf(
      createLauf(
        K100,
        Array.from({ length: bahnen }, (_, i) => ({ nummer: i + 1 })),
        'satz-1',
        { startversatzMs: versatzMs, wiederholung: index + 1 },
      ),
      index * taktMs,
      index * taktMs,
      versatzMs,
    ),
  )
}

// Setzt zwei Anschläge: den ersten `abStartMs` nach dem Start, das Finish
// fest nach 60 s. Der zweite Tap schließt die Runde, weil die Strecke zwei
// Längen hat.
function beende(lauf: Lauf, index: number, abStartMs: number): Lauf {
  const bahn = lauf.bahnen[index]!
  const start = bahn.startMs ?? 0
  return tapLane(tapLane(lauf, bahn.id, start + abStartMs, start + abStartMs), bahn.id, start + 60_000, start + 60_000)
}

// Nur ein Satz mit mehr als einer Wiederholung ist eine Serie; ein einzelner
// Lauf und ein fehlender Satz sind es nicht.
describe('istSerie', () => {
  it('erkennt einen Satz mit mehreren Wiederholungen', () => {
    const plan = { wiederholungen: 5, taktSek: 120, startversatzMs: 10_000 }
    const satz = { plan } as Satz
    expect(istSerie(satz)).toBe(true)
    expect(istSerie({ plan: null } as Satz)).toBe(false)
    expect(istSerie(null)).toBe(false)
  })
})

// `runden` filtert nach Satz und sortiert nach Wiederholungsnummer, ohne das
// Eingabe-Array zu verändern.
describe('runden', () => {
  // Die Übergabe ist absichtlich verdreht (Runde 3 vor Runde 1).
  it('sortiert Wiederholungen nach ihrer Nummer', () => {
    const laeufe = [serie(3)[2]!, serie(3)[0]!]
    const sortiert = runden(laeufe, 'satz-1')
    expect(sortiert).toHaveLength(2)
    expect(sortiert[0]?.wiederholung).toBe(1)
  })

  it('liefert ohne Satz keine Runden', () => {
    expect(runden(serie(2), null)).toEqual([])
  })

  it('kennt die nächste freie Wiederholungsnummer', () => {
    expect(naechsteWiederholung(serie(3))).toBe(4)
  })
})

// Verdichtung auf eine Zeile pro Bahn: Status, offene Runden, Countdown und
// Zielzeit. `now` wird explizit übergeben, damit jeder Zeitpunkt prüfbar ist.
describe('bahnZeile', () => {
  // Runde 1 ist im Ziel, Runde 2 startet erst bei 120 s; bei `now` = 70 s zeigt
  // die Zeile deshalb den Countdown von 50 s bis zum nächsten Start.
  it('zeigt die laufende Runde und den nächsten Countdown', () => {
    const laeufe = serie(3)
    const mitFertigerErster = [beende(laeufe[0]!, 0, 30_000), laeufe[1]!, laeufe[2]!]
    const zeile = bahnZeile(mitFertigerErster, 0, 70_000)
    expect(zeile.status).toBe('geplant')
    expect(zeile.offen).toBeNull()
    expect(zeile.naechste?.lauf.wiederholung).toBe(2)
    expect(zeile.letzte?.lauf.wiederholung).toBe(1)
    expect(zeile.anzeigeRunde).toBe(2)
    expect(zeilenZeit(zeile, 70_000)).toBe(50_000)
  })

  // Bei 130 s läuft Runde 2 bereits; ein Tap würde sie schließen, obwohl sie
  // nicht die höchste gestartete Runde ist. `offen` bleibt die älteste.
  it('schließt beim Tippen die älteste offene Runde', () => {
    const laeufe = serie(3)
    const mitFertigerErster = [beende(laeufe[0]!, 0, 30_000), laeufe[1]!, laeufe[2]!]
    const zeile = bahnZeile(mitFertigerErster, 0, 130_000)
    expect(zeile.status).toBe('laeuft')
    expect(zeile.offen?.lauf.wiederholung).toBe(2)
    expect(zeile.letzte?.lauf.wiederholung).toBe(1)
  })

  // Bei 250 s sind Runde 2 (seit 120 s) und Runde 3 (seit 240 s) offen. Der
  // feste Takt holt keine Runde nach; die Überlappung wird als überfällig
  // markiert, `offen` bleibt die älteste Runde 2.
  it('markiert eine überholte Runde als überfällig', () => {
    const laeufe = serie(3)
    const mitFertigerErster = [beende(laeufe[0]!, 0, 30_000), laeufe[1]!, laeufe[2]!]
    const zeile = bahnZeile(mitFertigerErster, 0, 250_000)
    expect(zeile.status).toBe('ueberfaellig')
    expect(zeile.offene.map((eintrag) => eintrag.lauf.wiederholung)).toEqual([2, 3])
    expect(zeile.offen?.lauf.wiederholung).toBe(2)
  })

  // Sind alle Runden im Ziel, zeigt die Zeile die letzte Zielzeit (60 s) statt
  // eines Countdowns.
  it('ist fertig, wenn alle Runden im Ziel sind', () => {
    const laeufe = serie(2).map((lauf) => beende(lauf, 0, 30_000))
    const zeile = bahnZeile(laeufe, 0, 300_000)
    expect(zeile.status).toBe('fertig')
    expect(zeile.letzte?.lauf.wiederholung).toBe(2)
    expect(zeilenZeit(zeile, 300_000)).toBe(60_000)
  })
})

// Undo in der Serie richtet sich nach der Wanduhr der letzten Bedienung, nicht
// nach der Rundennummer.
describe('letzterAnschlag', () => {
  // Runde 2 wird später bedient (erfasstAt 6_000) als Runde 1 (5_000), obwohl
  // ihre Splitzeit größer ist. Der jüngere Wanduhrwert gewinnt.
  it('nimmt die tatsächlich jüngste Bedienung, nicht die höchste Runde', () => {
    const laeufe = serie(2)
    const erste = tapLane(laeufe[0]!, laeufe[0]!.bahnen[0]!.id, 30_000, 5_000)
    const zweite = tapLane(laeufe[1]!, laeufe[1]!.bahnen[0]!.id, 150_000, 6_000)
    const treffer = letzterAnschlag([erste, zweite], 0)
    expect(treffer?.lauf.wiederholung).toBe(2)
  })
})

// Fortschritt und aktuelle Runde werden rein aus den Startzeiten abgeleitet.
describe('serieFortschritt', () => {
  // Eine Runde zählt erst als fertig, wenn alle ihre Bahnen im Ziel sind.
  it('zählt nur vollständig beendete Runden', () => {
    const laeufe = serie(3)
    const mitEinerFertigen = [beende(laeufe[0]!, 0, 30_000), laeufe[1]!, laeufe[2]!]
    expect(serieFortschritt(mitEinerFertigen)).toEqual({ fertig: 1, gesamt: 3 })
  })

  // Runde 1 startet bei 0 s, Runde 2 bei 120 s, Runde 3 bei 240 s; `aktuelleRunde`
  // liefert jeweils die höchste bereits gestartete Runde.
  it('kennt die Runde, die gerade im Becken ist', () => {
    expect(aktuelleRunde(serie(3), 0)).toBe(1)
    expect(aktuelleRunde(serie(3), 130_000)).toBe(2)
    expect(aktuelleRunde(serie(3), 250_000)).toBe(3)
  })
})

// Planprüfung: harte Grenzen als Fehler, ein zu kurzer Takt nur als Warnung.
describe('pruefeSeriePlan', () => {
  // Gültiger Plan mit 5 Bahnen; der Versatz von 10 s liegt unter dem Takt.
  const gueltig = { wiederholungen: 5, taktSek: 120, startversatzMs: 10_000 }

  it('akzeptiert einen sinnvollen Plan', () => {
    expect(pruefeSeriePlan(gueltig, 5)).toBeNull()
    expect(warnungSeriePlan(gueltig, 5)).toBeNull()
  })

  it('verlangt mindestens zwei Wiederholungen', () => {
    expect(pruefeSeriePlan({ ...gueltig, wiederholungen: 1 }, 5)).not.toBeNull()
  })

  it('lehnt einen Takt von null ab', () => {
    expect(pruefeSeriePlan({ ...gueltig, taktSek: 0 }, 5)).not.toBeNull()
  })

  // 30 s Takt sind kürzer als der Startversatz bis zur letzten Reihe
  // (4 × 10 s); das ist kein Fehler, aber ein Hinweis für den Trainer.
  it('warnt, wenn der Takt kürzer als der Versatz ist', () => {
    expect(warnungSeriePlan({ ...gueltig, taktSek: 30 }, 5)).not.toBeNull()
  })
})
