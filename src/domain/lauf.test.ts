import { describe, expect, it } from 'vitest'
import {
  createLauf,
  elapsedMs,
  finishLane,
  finishMs,
  hatLaufendeBahn,
  isFinished,
  isStreckeLocked,
  korrigiereAnschlag,
  laneStatus,
  pruefeAnschlagKorrektur,
  lastSplit,
  lengthCount,
  startAll,
  startLane,
  tapLane,
  undoLane,
  updateStrecke,
  validateKonfiguration,
} from './lauf'
import type { Lauf, LaufKonfiguration } from './types'

const K100 = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const
const OFFEN = { beckenlaengeM: 50, streckeM: null, schwimmart: 'freistil' } as const

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

describe('lengthCount', () => {
  it('rechnet die Strecke in Längen um', () => {
    expect(lengthCount(K100)).toBe(2)
    expect(lengthCount({ ...K100, beckenlaengeM: 25 })).toBe(4)
    expect(lengthCount(OFFEN)).toBeNull()
  })
})

describe('validateKonfiguration', () => {
  it('lehnt Strecken ab, die kein Vielfaches der Beckenlänge sind', () => {
    expect(validateKonfiguration({ ...K100, streckeM: 75 })).not.toBeNull()
    expect(validateKonfiguration({ ...K100, streckeM: 0 })).not.toBeNull()
    expect(validateKonfiguration(K100)).toBeNull()
    expect(validateKonfiguration(OFFEN)).toBeNull()
  })
})

describe('createLauf', () => {
  it('erzeugt bereite Bahnen mit Nummern', () => {
    const lauf = laufMit(K100, 6)
    expect(lauf.bahnen).toHaveLength(6)
    expect(lauf.bahnen.map((b) => b.nummer)).toEqual([1, 2, 3, 4, 5, 6])
    expect(lauf.bahnen.every((b) => laneStatus(b) === 'bereit')).toBe(true)
    expect(lauf.startWallMs).toBeNull()
  })
})

describe('startAll', () => {
  it('gibt allen Bahnen denselben Startzeitstempel', () => {
    const lauf = startAll(laufMit(K100, 4), 1000, 1_700_000_000_000)
    expect(lauf.bahnen.map((b) => b.startMs)).toEqual([1000, 1000, 1000, 1000])
    expect(lauf.startWallMs).toBe(1_700_000_000_000)
  })

  it('startet keine bereits laufende Bahn neu', () => {
    const basis = laufMit(K100, 2)
    const einzel = startLane(basis, basis.bahnen[0]!.id, 500, 1)
    const gestartet = startAll(einzel, 900, 2)
    expect(bahn(gestartet, 0).startMs).toBe(500)
    expect(bahn(gestartet, 1).startMs).toBe(900)
  })
})

describe('tapLane', () => {
  it('startet eine bereite Bahn beim ersten Tap', () => {
    const lauf = laufMit(K100, 1)
    const id = bahn(lauf).id
    const getippt = tapLane(lauf, id, 2000, 1)
    expect(bahn(getippt).startMs).toBe(2000)
    expect(bahn(getippt).anschlaege).toHaveLength(0)
    expect(laneStatus(bahn(getippt))).toBe('laeuft')
  })

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

  it('beendet bei konfigurierter Strecke nichts explizit', () => {
    const start = laufMit(K100, 1)
    const id = bahn(start).id
    const lauf = tapLane(start, id, 0, 1)
    expect(finishLane(lauf, id, 50_000, 2)).toBe(lauf)
  })
})

describe('undoLane', () => {
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

describe('elapsedMs', () => {
  it('ist null vor dem Start und wächst danach monoton', () => {
    const lauf = laufMit(K100, 1)
    expect(elapsedMs(bahn(lauf), 9999)).toBe(0)
    const gestartet = startLane(lauf, bahn(lauf).id, 1000, 1)
    expect(elapsedMs(bahn(gestartet), 3500)).toBe(2500)
  })
})

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

describe('korrigiereAnschlag', () => {
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

  it('erhält das Finish-Flag bei der letzten Länge', () => {
    const { lauf, bahnId } = zweiLaengen()
    const korrigiert = korrigiereAnschlag(lauf, bahnId, 2, 58_000)
    expect(finishMs(bahn(korrigiert))).toBe(58_000)
    expect(bahn(korrigiert).anschlaege[1]?.manuell).toBe(true)
  })

  it('erzeugt aus einer Zwischenzeit kein Finish', () => {
    const start = laufMit({ ...K100, streckeM: 150 }, 1)
    const bahnId = bahn(start).id
    const offen = tapLane(tapLane(start, bahnId, 0, 1), bahnId, 30_000, 2)
    const korrigiert = korrigiereAnschlag(offen, bahnId, 1, 20_000)
    expect(isFinished(bahn(korrigiert))).toBe(false)
    expect(bahn(korrigiert).anschlaege[0]?.istFinish).toBe(false)
  })

  it('lehnt Zeiten ab, die die Reihenfolge brechen', () => {
    const { lauf, bahnId } = zweiLaengen()
    expect(pruefeAnschlagKorrektur(lauf, bahnId, 1, 61_000)).not.toBeNull()
    expect(pruefeAnschlagKorrektur(lauf, bahnId, 2, 10_000)).not.toBeNull()
    expect(korrigiereAnschlag(lauf, bahnId, 1, 61_000)).toBe(lauf)
    expect(pruefeAnschlagKorrektur(lauf, bahnId, 1, 31_000)).toBeNull()
  })
})
