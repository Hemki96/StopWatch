/**
 * Zeitkern eines Laufs: Start, Anschlag, Finish, Undo und Korrektur.
 *
 * Sichert die Invarianten aus `lauf.ts` ab: `startMs` wird pro Bahn höchstens
 * einmal gesetzt, Splits sind kumulativ ab Start der Bahn, höchstens der letzte
 * Anschlag trägt `istFinish`, und wirkungslose Aufrufe geben dasselbe Objekt
 * zurück. Regressionsfälle sind der Startversatz (geplante Bahnen, die Taps
 * ignorieren), die offene Strecke ohne automatisches Finish sowie Undo und
 * Korrektur, die die Reihenfolge der Splits nicht brechen dürfen.
 *
 * Alle Zeiten sind reine Zahlen: `now` entspricht `performance.now()`,
 * `wallNow` entspricht `Date.now()`. Die Tests übergeben feste Werte statt
 * echter Uhren, damit Splits und Finish deterministisch sind.
 */
import { describe, expect, it } from 'vitest'
import {
  bahnenNachReihen,
  bahnReihe,
  createLauf,
  elapsedMs,
  finishLane,
  finishMs,
  hatBegonnen,
  hatLaufendeBahn,
  isComplete,
  isFinished,
  isStartLocked,
  istBahnBeendet,
  isStreckeLocked,
  korrigiereAnschlag,
  laneStatus,
  laneStatusAt,
  normalisiereReihe,
  planeLauf,
  pruefeAnschlagKorrektur,
  lastSplit,
  laufzeitMs,
  lengthCount,
  reihenVon,
  setzeWettkampfStatus,
  setzeZielzeit,
  startAll,
  startLane,
  tapLane,
  undoLane,
  updateStrecke,
  validateKonfiguration,
} from './lauf'
import type { Lauf, LaufKonfiguration } from './types'

// Zwei Standardkonfigurationen: `K100` hat mit zwei Längen ein automatisches
// Finish, `OFFEN` erzeugt nur Splits und braucht ein ausdrückliches Ziel.
const K100 = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const
const OFFEN = { beckenlaengeM: 50, streckeM: null, schwimmart: 'freistil' } as const

// Baut einen Lauf mit fortlaufenden Bahnnummern. `bahn` greift auf eine Bahn
// zu und macht einen fehlenden Index sofort als Testfehler sichtbar.
function laufMit(konfiguration: LaufKonfiguration, bahnen = 3): Lauf {
  return createLauf(
    konfiguration,
    Array.from({ length: bahnen }, (_, i) => ({ nummer: i + 1 })),
  )
}

function bahn(lauf: Lauf, index = 0) {
  const b = lauf.bahnen[index]
  if (!b) throw new Error('Bahn fehlt')
  return b
}

// Umrechnung Strecke → Längen: 100 m sind im 50-m-Becken zwei Längen, im
// 25-m-Becken vier; eine offene Strecke hat keine Ziel-Länge.
describe('lengthCount', () => {
  it('rechnet die Strecke in Längen um', () => {
    expect(lengthCount(K100)).toBe(2)
    expect(lengthCount({ ...K100, beckenlaengeM: 25 })).toBe(4)
    expect(lengthCount(OFFEN)).toBeNull()
  })
})

// Nur Vielfache der Beckenlänge sind gültig: 75 m im 50-m-Becken und eine
// Strecke von 0 m sind Fehler, die offene Strecke (`null`) dagegen immer gültig.
describe('validateKonfiguration', () => {
  it('lehnt Strecken ab, die kein Vielfaches der Beckenlänge sind', () => {
    expect(validateKonfiguration({ ...K100, streckeM: 75 })).not.toBeNull()
    expect(validateKonfiguration({ ...K100, streckeM: 0 })).not.toBeNull()
    expect(validateKonfiguration(K100)).toBeNull()
    expect(validateKonfiguration(OFFEN)).toBeNull()
  })
})

// Ein neuer Lauf ist unberührt: Bahnen 1..n sind „bereit“, es gibt keinen
// Wanduhr-Anker.
describe('createLauf', () => {
  it('erzeugt bereite Bahnen mit Nummern', () => {
    const lauf = laufMit(K100, 6)
    expect(lauf.bahnen).toHaveLength(6)
    expect(lauf.bahnen.map((b) => b.nummer)).toEqual([1, 2, 3, 4, 5, 6])
    expect(lauf.bahnen.every((b) => laneStatus(b) === 'bereit')).toBe(true)
    expect(lauf.startWallMs).toBeNull()
  })
})

// „Start alle“ setzt denselben Startzeitstempel auf alle Bahnen und den
// Wanduhr-Anker genau einmal.
describe('startAll', () => {
  it('gibt allen Bahnen denselben Startzeitstempel', () => {
    const lauf = startAll(laufMit(K100, 4), 1000, 1_700_000_000_000)
    expect(lauf.bahnen.map((b) => b.startMs)).toEqual([1000, 1000, 1000, 1000])
    expect(lauf.startWallMs).toBe(1_700_000_000_000)
  })

  // Eine bereits einzeln gestartete Bahn behält ihren Start; nur die übrigen
  // bekommen den neuen Zeitstempel.
  it('startet keine bereits laufende Bahn neu', () => {
    const basis = laufMit(K100, 2)
    const einzel = startLane(basis, basis.bahnen[0]!.id, 500, 1)
    const gestartet = startAll(einzel, 900, 2)
    expect(bahn(gestartet, 0).startMs).toBe(500)
    expect(bahn(gestartet, 1).startMs).toBe(900)
  })
})

// Der zentrale Bedienschritt: Der erste Tap startet, weitere Taps erfassen
// Splits; bei fester Strecke ist der letzte Anschlag das Ziel.
describe('tapLane', () => {
  it('startet eine bereite Bahn beim ersten Tap', () => {
    const lauf = laufMit(K100, 1)
    const id = bahn(lauf).id
    const getippt = tapLane(lauf, id, 2000, 1)
    expect(bahn(getippt).startMs).toBe(2000)
    expect(bahn(getippt).anschlaege).toHaveLength(0)
    expect(laneStatus(bahn(getippt))).toBe('laeuft')
  })

  // 31_250 ms und 64_000 ms sind kumulierte Splits; die zweite Länge schließt
  // den Lauf ab.
  it('erfasst Splits und erkennt das Finish aus der Strecke', () => {
    const start = laufMit(K100, 1)
    const id = bahn(start).id
    let lauf = tapLane(start, id, 0, 1)

    lauf = tapLane(lauf, id, 31_250, 2)
    expect(bahn(lauf).anschlaege).toHaveLength(1)
    expect(lastSplit(bahn(lauf))).toMatchObject({ laengeNr: 1, splitMs: 31_250, istFinish: false })
    expect(laneStatus(bahn(lauf))).toBe('laeuft')

    lauf = tapLane(lauf, id, 64_000, 3)
    expect(lastSplit(bahn(lauf))).toMatchObject({ laengeNr: 2, splitMs: 64_000, istFinish: true })
    expect(laneStatus(bahn(lauf))).toBe('beendet')
    expect(finishMs(bahn(lauf))).toBe(64_000)
  })

  // Nach dem Finish ist die Bahn zu; der Tap liefert dasselbe Objekt zurück und
  // erzeugt keinen dritten Anschlag.
  it('ignoriert Taps auf beendeten Bahnen', () => {
    const start = laufMit(K100, 1)
    const id = bahn(start).id
    let lauf = tapLane(start, id, 0, 1)
    lauf = tapLane(lauf, id, 30_000, 2)
    lauf = tapLane(lauf, id, 60_000, 3)
    const danach = tapLane(lauf, id, 61_000, 4)
    expect(danach).toBe(lauf)
    expect(bahn(danach).anschlaege).toHaveLength(2)
  })

  // Regression: Splits rechnen ab dem Start der jeweiligen Bahn. Ein Bezug auf
  // den Laufstart würde hier 54 s statt 50 s liefern.
  it('misst Splits relativ zum Start der jeweiligen Bahn, nicht zum Lauf', () => {
    const start = laufMit(K100, 2)
    const [a, b] = start.bahnen
    let lauf = startLane(start, a!.id, 1_000, 1)
    lauf = startLane(lauf, b!.id, 5_000, 2)

    lauf = tapLane(lauf, a!.id, 51_000, 3)
    lauf = tapLane(lauf, b!.id, 55_000, 4)

    expect(lastSplit(bahn(lauf, 0))?.splitMs).toBe(50_000)
    expect(lastSplit(bahn(lauf, 1))?.splitMs).toBe(50_000)
  })
})

// Ohne feste Strecke bleibt jeder Anschlag ein Split; das Ziel wird nur
// ausdrücklich über `finishLane` gesetzt.
describe('offene Strecke', () => {
  it('erfasst jeden Tap als Split und beendet nur explizit', () => {
    const start = laufMit(OFFEN, 1)
    const id = bahn(start).id
    let lauf = tapLane(start, id, 0, 1)
    lauf = tapLane(lauf, id, 40_000, 2)
    lauf = tapLane(lauf, id, 80_000, 3)

    expect(bahn(lauf).anschlaege).toHaveLength(2)
    expect(bahn(lauf).anschlaege.every((a) => !a.istFinish)).toBe(true)
    expect(laneStatus(bahn(lauf))).toBe('laeuft')

    lauf = finishLane(lauf, id, 120_000, 4)
    expect(isFinished(bahn(lauf))).toBe(true)
    expect(finishMs(bahn(lauf))).toBe(120_000)
  })

  // Mit fester Strecke ist `finishLane` wirkungslos: Dort entsteht das Finish
  // allein aus der erreichten Längenanzahl.
  it('beendet bei konfigurierter Strecke nichts explizit', () => {
    const start = laufMit(K100, 1)
    const id = bahn(start).id
    const lauf = tapLane(start, id, 0, 1)
    expect(finishLane(lauf, id, 50_000, 2)).toBe(lauf)
  })
})

// Undo nimmt genau einen Schritt zurück: zuerst den letzten Anschlag, sonst den
// Start; eine unberührte Bahn bleibt unverändert.
describe('undoLane', () => {
  // Das Zurücknehmen des Finish-Anschlags macht aus „beendet“ wieder „läuft“;
  // die Zwischenzeit davor bleibt erhalten.
  it('entfernt den letzten Anschlag und macht ein Finish rückgängig', () => {
    const start = laufMit(K100, 1)
    const id = bahn(start).id
    let lauf = tapLane(start, id, 0, 1)
    lauf = tapLane(lauf, id, 30_000, 2)
    lauf = tapLane(lauf, id, 60_000, 3)
    expect(laneStatus(bahn(lauf))).toBe('beendet')

    lauf = undoLane(lauf, id)
    expect(bahn(lauf).anschlaege).toHaveLength(1)
    expect(laneStatus(bahn(lauf))).toBe('laeuft')
  })

  it('nimmt den Start zurück, wenn noch kein Anschlag existiert', () => {
    const start = laufMit(K100, 1)
    const id = bahn(start).id
    const lauf = undoLane(tapLane(start, id, 1000, 1), id)
    expect(bahn(lauf).startMs).toBeNull()
    expect(laneStatus(bahn(lauf))).toBe('bereit')
  })

  it('lässt eine unberührte Bahn unverändert', () => {
    const lauf = laufMit(K100, 1)
    expect(undoLane(lauf, bahn(lauf).id)).toBe(lauf)
  })
})

// Verstrichene Zeit ist vor dem Start 0 und danach die Differenz zu `now`.
describe('elapsedMs', () => {
  it('ist null vor dem Start und wächst danach monoton', () => {
    const lauf = laufMit(K100, 1)
    expect(elapsedMs(bahn(lauf), 9999)).toBe(0)
    const gestartet = startLane(lauf, bahn(lauf).id, 1000, 1)
    expect(elapsedMs(bahn(gestartet), 3500)).toBe(2500)
  })
})

// Die Laufzeit beginnt beim ersten Start und friert nach dem letzten Ziel ein.
// Der Startversatz der Reihen gehört zur Laufzeit, nicht zu einer eigenen Uhr.
describe('laufzeitMs', () => {
  it('ist null, solange keine Bahn gestartet ist', () => {
    expect(laufzeitMs(laufMit(K100, 2), 5000)).toBeNull()
  })

  it('beginnt beim ersten Start und zählt die verstrichene Zeit', () => {
    const lauf = laufMit(K100, 2)
    const gestartet = startAll(lauf, 1000, 1)
    expect(laufzeitMs(gestartet, 12_500)).toBe(11_500)
  })

  it('berücksichtigt den Startversatz der Reihen', () => {
    const lauf = {
      ...createLauf(
        K100,
        [
          { nummer: 1, reihe: 1 },
          { nummer: 1, reihe: 2 },
        ],
      ),
      startversatzMs: 5000,
    }
    const gestartet = startAll(lauf, 1000, 1)
    // Reihe 2 startet 5 s später; die Laufzeit beginnt trotzdem mit Reihe 1.
    expect(bahn(gestartet, 1).startMs).toBe(6000)
    expect(laufzeitMs(gestartet, 11_000)).toBe(10_000)
  })

  it('friert beim letzten Ziel ein', () => {
    const start = laufMit(K100, 2)
    const erste = bahn(start, 0).id
    const zweite = bahn(start, 1).id
    let lauf = startAll(start, 1000, 1)
    // Bahn 1 ist nach 60 s im Ziel (zwei Längen), Bahn 2 nach 75 s.
    lauf = tapLane(tapLane(tapLane(lauf, erste, 31_000, 2), erste, 61_000, 3), zweite, 46_000, 2)
    lauf = tapLane(lauf, zweite, 76_000, 3)
    expect(isFinished(bahn(lauf, 1))).toBe(true)
    // Weit nach dem letzten Ziel bleibt der Wert stehen.
    expect(laufzeitMs(lauf, 200_000)).toBe(75_000)
  })
})

// Die Funktion entscheidet, ob ein Reload einen laufenden Lauf verlieren würde:
// geplante und laufende Bahnen zählen, vollständig beendete nicht.
describe('hatLaufendeBahn', () => {
  it('ist false für einen angelegten, nie gestarteten Lauf', () => {
    expect(hatLaufendeBahn(laufMit(K100, 2))).toBe(false)
    expect(hatLaufendeBahn(null)).toBe(false)
  })

  it('ist true, sobald mindestens eine Bahn läuft', () => {
    const start = laufMit(K100, 2)
    const gestartet = tapLane(start, bahn(start).id, 1000, 1)
    expect(hatLaufendeBahn(gestartet)).toBe(true)
  })

  it('ist false, wenn alle Bahnen im Ziel sind', () => {
    const start = laufMit(K100, 1)
    const id = bahn(start).id
    const fertig = tapLane(tapLane(tapLane(start, id, 0, 1), id, 30_000, 2), id, 60_000, 3)
    expect(isFinished(bahn(fertig))).toBe(true)
    expect(hatLaufendeBahn(fertig)).toBe(false)
  })
})

// Beckenlänge und Strecke sind ab dem ersten Anschlag gesperrt; vorher ist ein
// Wechsel erlaubt, weil noch keine Länge gemessen wurde.
describe('updateStrecke', () => {
  it('sperrt die Strecke, sobald ein Anschlag existiert', () => {
    const start = laufMit(K100, 1)
    const id = bahn(start).id
    expect(isStreckeLocked(start)).toBe(false)

    const lauf = tapLane(tapLane(start, id, 0, 1), id, 30_000, 2)
    expect(isStreckeLocked(lauf)).toBe(true)
    expect(updateStrecke(lauf, { ...K100, streckeM: 200 })).toBe(lauf)
  })

  it('erlaubt Änderungen vor dem ersten Anschlag', () => {
    const lauf = laufMit(K100, 1)
    const geaendert = updateStrecke(lauf, { ...K100, streckeM: 200 })
    expect(geaendert.konfiguration.streckeM).toBe(200)
  })
})

// Korrekturen ändern genau einen Anschlag, markieren ihn als `manuell` und
// dürfen die aufsteigende Reihenfolge der Splits nicht brechen.
describe('korrigiereAnschlag', () => {
  // Zwei Anschläge (30 s, 60 s) im 100-m-Lauf: Der zweite ist das Finish.
  function zweiLaengen() {
    const start = laufMit(K100, 1)
    const id = bahn(start).id
    const lauf = tapLane(tapLane(tapLane(start, id, 0, 1), id, 30_000, 2), id, 60_000, 3)
    return { lauf, bahnId: id }
  }

  it('korrigiert eine Zwischenzeit, ohne das Finish zu verschieben', () => {
    const { lauf, bahnId } = zweiLaengen()
    const korrigiert = korrigiereAnschlag(lauf, bahnId, 1, 31_000)
    expect(bahn(korrigiert).anschlaege[0]?.splitMs).toBe(31_000)
    expect(bahn(korrigiert).anschlaege[0]?.istFinish).toBe(false)
    expect(bahn(korrigiert).anschlaege[0]?.manuell).toBe(true)
    expect(bahn(korrigiert).anschlaege[1]?.splitMs).toBe(60_000)
    expect(bahn(korrigiert).anschlaege[1]?.istFinish).toBe(true)
  })

  // Die letzte Länge bleibt Ziel, auch wenn ihre Zeit korrigiert wird.
  it('erhält das Finish-Flag bei der letzten Länge', () => {
    const { lauf, bahnId } = zweiLaengen()
    const korrigiert = korrigiereAnschlag(lauf, bahnId, 2, 58_000)
    expect(finishMs(bahn(korrigiert))).toBe(58_000)
    expect(bahn(korrigiert).anschlaege[1]?.manuell).toBe(true)
  })

  // 150 m sind drei Längen; nach nur einem Anschlag bleibt die korrigierte
  // Länge 1 ein Zwischenanschlag und wird nicht zum Finish.
  it('erzeugt aus einer Zwischenzeit kein Finish', () => {
    const start = laufMit({ ...K100, streckeM: 150 }, 1)
    const bahnId = bahn(start).id
    const offen = tapLane(tapLane(start, bahnId, 0, 1), bahnId, 30_000, 2)
    const korrigiert = korrigiereAnschlag(offen, bahnId, 1, 20_000)
    expect(isFinished(bahn(korrigiert))).toBe(false)
    expect(bahn(korrigiert).anschlaege[0]?.istFinish).toBe(false)
  })

  // 61 s läge hinter dem Finish (60 s), 10 s vor dem ersten Split. Beides wird
  // gemeldet; die Korrektur selbst bleibt wirkungslos.
  it('lehnt Zeiten ab, die die Reihenfolge brechen', () => {
    const { lauf, bahnId } = zweiLaengen()
    expect(pruefeAnschlagKorrektur(lauf, bahnId, 1, 61_000)).not.toBeNull()
    expect(pruefeAnschlagKorrektur(lauf, bahnId, 2, 10_000)).not.toBeNull()
    expect(korrigiereAnschlag(lauf, bahnId, 1, 61_000)).toBe(lauf)
    expect(pruefeAnschlagKorrektur(lauf, bahnId, 1, 31_000)).toBeNull()
  })
})

// Startversatz: Alle Bahnen einer Reihe starten gemeinsam, die nächste Reihe
// versetzt; Taps vor dem eigenen Startzeitpunkt werden ignoriert.
describe('Startversatz', () => {
  // Zwei Reihen à drei Bahnen: Reihe 1 startet sofort, Reihe 2 nach 10 s.
  function gestaffelt(reihen = 2, proReihe = 3, versatzMs = 10_000): Lauf {
    return createLauf(
      K100,
      Array.from({ length: reihen * proReihe }, (_, i) => ({
        nummer: (i % proReihe) + 1,
        reihe: Math.floor(i / proReihe) + 1,
      })),
      null,
      { startversatzMs: versatzMs },
    )
  }

  // Der Versatz wird pro Reihe addiert, nicht pro Bahnindex; `startWallMs`
  // bleibt der gemeinsame Wanduhr-Anker des Laufs.
  it('startet die Reihen im festen Abstand und je Reihe gemeinsam', () => {
    const lauf = startAll(gestaffelt(), 1000, 5000)
    expect(lauf.bahnen.map((b) => b.startMs)).toEqual([
      1000, 1000, 1000, 11_000, 11_000, 11_000,
    ])
    expect(lauf.startWallMs).toBe(5000)
    expect(lauf.startversatzMs).toBe(10_000)
  })

  // Ohne zweite Reihe gibt es nichts zu staffeln: Der Versatz bleibt wirkungslos
  // und alle Bahnen starten gemeinsam.
  it('startet eine einzelne Reihe trotz Versatz gemeinsam', () => {
    const lauf = startAll(gestaffelt(1, 4), 1000, 5000)
    expect(lauf.bahnen.map((b) => b.startMs)).toEqual([1000, 1000, 1000, 1000])
  })

  // `laneStatusAt` unterscheidet „geplant“ von „läuft“ anhand von `now`;
  // `laneStatus` ohne Zeitbezug kennt diesen Zustand bewusst nicht.
  it('meldet eine Bahn vor ihrer Reihe als geplant', () => {
    const lauf = startAll(gestaffelt(), 1000, 5000)
    expect(laneStatusAt(lauf.bahnen[0]!, 500)).toBe('geplant')
    expect(laneStatusAt(lauf.bahnen[0]!, 1000)).toBe('laeuft')
    expect(laneStatusAt(lauf.bahnen[3]!, 5000)).toBe('geplant')
    expect(laneStatusAt(lauf.bahnen[3]!, 11_000)).toBe('laeuft')
  })

  // Der Tap bei 5000 ms liegt vor dem Start der zweiten Reihe (11 s); erst ab
  // deren Start entsteht ein Split von 1 s.
  it('ignoriert Taps, bevor die Reihe startet', () => {
    const lauf = startAll(gestaffelt(), 1000, 5000)
    const unveraendert = tapLane(lauf, lauf.bahnen[3]!.id, 5000, 6000)
    expect(unveraendert).toBe(lauf)

    const getippt = tapLane(lauf, lauf.bahnen[3]!.id, 12_000, 13_000)
    expect(bahn(getippt, 3).anschlaege).toHaveLength(1)
    expect(bahn(getippt, 3).anschlaege[0]?.splitMs).toBe(1000)
  })

  it('hält den Lauf aktiv, solange eine Reihe geplant ist', () => {
    const lauf = startAll(gestaffelt(2, 2), 1000, 5000)
    expect(hatLaufendeBahn(lauf)).toBe(true)
  })

  // `planeLauf` überschreibt vorhandene Startzeiten; hier mit 5 s Versatz,
  // damit die Staffelung zwischen den Reihen sichtbar wird.
  it('setzt mit planeLauf alle Starts neu', () => {
    const lauf = planeLauf(gestaffelt(2, 2), 0, 1000, 5000)
    expect(lauf.bahnen.map((b) => b.startMs)).toEqual([0, 0, 5000, 5000])
    expect(lauf.startWallMs).toBe(1000)
    expect(lauf.startversatzMs).toBe(5000)
  })

  // Nach dem ersten Start darf der Versatz nicht mehr geändert werden, sonst
  // würden bereits geplante Bahnen nachträglich verschoben.
  it('sperrt den Start nach dem ersten Start', () => {
    const lauf = gestaffelt(2, 2)
    expect(isStartLocked(lauf)).toBe(false)
    expect(isStartLocked(startAll(lauf, 1000, 5000))).toBe(true)
  })
})

// Reihen sind Startgruppen: Jede Bahn gehört zu genau einer Reihe, die
// Gruppierung ist zugleich die Startstaffelung.
describe('Reihen', () => {
  it('normalisiert fehlende oder unbrauchbare Reihen auf 1', () => {
    expect(normalisiereReihe(undefined)).toBe(1)
    expect(normalisiereReihe(Number.NaN)).toBe(1)
    expect(normalisiereReihe(0)).toBe(1)
    expect(normalisiereReihe(2.4)).toBe(2)
  })

  it('legt Bahnen ohne Reihe in Reihe 1 an', () => {
    const lauf = createLauf(K100, [{ nummer: 1 }, { nummer: 2, reihe: 3 }])
    expect(lauf.bahnen.map(bahnReihe)).toEqual([1, 3])
    expect(reihenVon(lauf)).toBe(3)
  })

  it('gruppiert Bahnen nach Reihe und behält die Reihenfolge darin', () => {
    const lauf = createLauf(K100, [
      { nummer: 1, reihe: 2 },
      { nummer: 2, reihe: 1 },
      { nummer: 1, reihe: 2 },
      { nummer: 2, reihe: 1 },
    ])
    const gruppen = bahnenNachReihen(lauf.bahnen)
    expect(gruppen.map((gruppe) => gruppe.reihe)).toEqual([1, 2])
    expect(gruppen[0]?.bahnen.map((bahn) => bahn.nummer)).toEqual([2, 2])
    expect(gruppen[1]?.bahnen.map((bahn) => bahn.nummer)).toEqual([1, 1])
  })

  it('meldet für einen Lauf ohne Bahnen eine Reihe', () => {
    expect(reihenVon(createLauf(K100, []))).toBe(1)
  })
})

// `hatBegonnen` entscheidet über den Eintrag im Verlauf und richtet sich nach
// der Wanduhr, nicht nach `performance.now()`.
describe('hatBegonnen', () => {  // Der Wanduhr-Anker liegt bei 1000; erst ab diesem Wert gilt der Lauf als
  // begonnen, auch wenn die zweite Reihe erst später startet.
  it('zählt eine noch in der Zukunft liegende Runde nicht', () => {
    const lauf = startAll(
      createLauf(
        K100,
        [
          { nummer: 1 },
          { nummer: 1, reihe: 2 },
        ],
        null,
        { startversatzMs: 10_000 },
      ),
      0,
      1000,
    )
    expect(hatBegonnen(lauf, 999)).toBe(false)
    expect(hatBegonnen(lauf, 1000)).toBe(true)
  })

  it('zählt einen vorbereiteten Lauf ohne Start nicht', () => {
    expect(hatBegonnen(laufMit(K100, 2), 10_000)).toBe(false)
  })

  it('zählt einen Anschlag auch ohne gültige Startzeit', () => {
    const lauf = laufMit(K100, 1)
    lauf.bahnen[0]!.anschlaege.push({
      laengeNr: 1,
      splitMs: 30_000,
      erfasstAt: 1,
      istFinish: false,
    })
    expect(hatBegonnen(lauf, 0)).toBe(true)
  })

  // Spätere Wiederholungen einer Serie erscheinen erst mit dem ersten
  // Anschlag; sonst würden nach einem Reload alle nur geplanten Runden als
  // unvollständig im Verlauf stehen.
  it('zeigt spätere Wiederholungen erst mit dem ersten Anschlag', () => {
    const lauf = planeLauf(
      createLauf(K100, [{ nummer: 1 }], null, { wiederholung: 2 }),
      0,
      1000,
    )
    expect(hatBegonnen(lauf, 5000)).toBe(false)
    lauf.bahnen[0]!.anschlaege.push({
      laengeNr: 1,
      splitMs: 30_000,
      erfasstAt: 1,
      istFinish: false,
    })
    expect(hatBegonnen(lauf, 5000)).toBe(true)
  })

  // Im Wettkampf ist `wiederholung` die Laufnummer, keine Serienrunde; ein
  // gestarteter Heat gehört deshalb sofort in den Verlauf.
  it('zeigt einen gestarteten Wettkampf-Heat auch ab Lauf 2 sofort', () => {
    const lauf = startAll(
      createLauf(K100, [{ nummer: 1 }], null, { modus: 'wettkampf', wiederholung: 2 }),
      0,
      1000,
    )
    expect(hatBegonnen(lauf, 1000)).toBe(true)
  })
})


// Wettkampf-Status: DNS/DNF beendet eine Bahn endgültig ohne Zeit. Eine
// markierte Bahn nimmt weder Start noch Anschlag an und zählt nicht als
// laufende Bahn; Zurücknehmen macht sie wieder offen.
describe('setzeWettkampfStatus', () => {
  /** Ein Heat mit einer Bahn, wie ihn der Wettkampf anlegt. */
  function heat(bahnen = 1): Lauf {
    return { ...laufMit(K100, bahnen), modus: 'wettkampf' }
  }

  it('markiert DNS, entfernt den Start und ignoriert weitere Taps', () => {
    let lauf = startAll(heat(), 0, 1)
    const id = bahn(lauf).id
    lauf = setzeWettkampfStatus(lauf, id, 'dns')

    expect(bahn(lauf).status).toBe('dns')
    expect(bahn(lauf).startMs).toBeNull()
    expect(istBahnBeendet(bahn(lauf))).toBe(true)
    // Endgültig: kein Start, kein Anschlag, keine Zeit.
    expect(tapLane(lauf, id, 5000, 5000)).toBe(lauf)
    expect(startAll(lauf, 9000, 9000)).toBe(lauf)
    expect(setzeZielzeit(lauf, id, 60_000)).toBe(lauf)
  })

  it('lässt DNF den Start stehen und beendet den Heat', () => {
    let lauf = startAll(heat(2), 0, 1)
    const [erste, zweite] = lauf.bahnen.map((eintrag) => eintrag.id)
    lauf = tapLane(tapLane(lauf, erste!, 30_000, 2), erste!, 60_000, 3)
    lauf = setzeWettkampfStatus(lauf, zweite!, 'dnf')

    expect(bahn(lauf, 1).status).toBe('dnf')
    expect(bahn(lauf, 1).startMs).toBe(0)
    expect(istBahnBeendet(bahn(lauf, 1))).toBe(true)
    // Alle Bahnen sind entschieden: eine Zeit, eine DNF.
    expect(isComplete(lauf)).toBe(true)
    expect(hatLaufendeBahn(lauf)).toBe(false)
  })

  it('hebt die Markierung wieder auf', () => {
    // IDs sind je Aufruf neu; deshalb aus demselben Lauf markieren und lösen.
    const basis = heat()
    const id = bahn(basis).id
    const lauf = setzeWettkampfStatus(basis, id, 'dns')
    const offen = setzeWettkampfStatus(lauf, id, null)
    expect(bahn(offen).status).toBeUndefined()
    expect(istBahnBeendet(bahn(offen))).toBe(false)
  })

  it('lehnt Markierungen im Training und auf gewerteten Bahnen ab', () => {
    const training = laufMit(K100, 1)
    const id = bahn(training).id
    expect(setzeWettkampfStatus(training, id, 'dns')).toBe(training)

    let lauf = startAll(heat(), 0, 1)
    lauf = tapLane(tapLane(lauf, id, 30_000, 2), id, 60_000, 3)
    expect(setzeWettkampfStatus(lauf, id, 'dnf')).toBe(lauf)
  })

  it('nimmt den Status mit der letzten Aktion zurück', () => {
    let lauf = startAll(heat(), 0, 1)
    const id = bahn(lauf).id
    lauf = setzeWettkampfStatus(lauf, id, 'dnf')
    const zurueck = undoLane(lauf, id)
    expect(bahn(zurueck).status).toBeUndefined()
    expect(bahn(zurueck).startMs).toBeNull()
  })
})
