import { newId } from './id'
import type {
  Anschlag,
  Bahn,
  BahnStatus,
  Lauf,
  LaufKonfiguration,
  Schwimmart,
} from './types'

export interface BahnInit {
  nummer: number
  schwimmerId?: string | null
}

export const STANDARD_KONFIGURATION: LaufKonfiguration = {
  beckenlaengeM: 50,
  streckeM: 100,
  schwimmart: 'freistil',
}

/** Anzahl der Längen, die eine Strecke umfasst. `null` bei offener Strecke. */
export function lengthCount(konfiguration: LaufKonfiguration): number | null {
  if (konfiguration.streckeM === null) return null
  return Math.round(konfiguration.streckeM / konfiguration.beckenlaengeM)
}

export function validateKonfiguration(konfiguration: LaufKonfiguration): string | null {
  if (konfiguration.streckeM === null) return null
  if (!Number.isFinite(konfiguration.streckeM) || konfiguration.streckeM <= 0) {
    return 'Die Strecke muss größer als 0 m sein.'
  }
  if (konfiguration.streckeM % konfiguration.beckenlaengeM !== 0) {
    return `Die Strecke muss ein Vielfaches der Beckenlänge (${konfiguration.beckenlaengeM} m) sein.`
  }
  return null
}

export function createLauf(
  konfiguration: LaufKonfiguration,
  bahnen: BahnInit[],
  satzId: string | null = null,
): Lauf {
  return {
    id: newId(),
    satzId,
    konfiguration: { ...konfiguration },
    startWallMs: null,
    bahnen: bahnen.map((b) => ({
      id: newId(),
      nummer: b.nummer,
      schwimmerId: b.schwimmerId ?? null,
      startMs: null,
      anschlaege: [],
    })),
  }
}

export function isFinished(bahn: Bahn): boolean {
  return bahn.anschlaege.some((a) => a.istFinish)
}

export function laneStatus(bahn: Bahn): BahnStatus {
  if (isFinished(bahn)) return 'beendet'
  if (bahn.startMs === null) return 'bereit'
  return 'laeuft'
}

export function elapsedMs(bahn: Bahn, now: number): number {
  if (bahn.startMs === null) return 0
  return Math.max(0, now - bahn.startMs)
}

/** Endzeit der Bahn, sofern sie beendet ist. */
export function finishMs(bahn: Bahn): number | null {
  const finish = bahn.anschlaege.find((a) => a.istFinish)
  return finish ? finish.splitMs : null
}

/** Letzter Anschlag, unabhängig davon ob er das Finish ist. */
export function lastSplit(bahn: Bahn): Anschlag | null {
  return bahn.anschlaege.at(-1) ?? null
}

export function findBahn(lauf: Lauf, bahnId: string): Bahn | undefined {
  return lauf.bahnen.find((b) => b.id === bahnId)
}

function updateBahn(lauf: Lauf, bahnId: string, update: (bahn: Bahn) => Bahn): Lauf {
  let changed = false
  const bahnen = lauf.bahnen.map((bahn) => {
    if (bahn.id !== bahnId) return bahn
    const next = update(bahn)
    if (next !== bahn) changed = true
    return next
  })
  return changed ? { ...lauf, bahnen } : lauf
}

/** Startet eine Bahn. Bereits gestartete oder beendete Bahnen bleiben unverändert. */
export function startLane(lauf: Lauf, bahnId: string, now: number, wallNow: number): Lauf {
  const next = updateBahn(lauf, bahnId, (bahn) =>
    bahn.startMs === null ? { ...bahn, startMs: now } : bahn,
  )
  if (next === lauf) return lauf
  return { ...next, startWallMs: lauf.startWallMs ?? wallNow }
}

/** Startet alle noch nicht gestarteten Bahnen mit demselben Zeitstempel. */
export function startAll(lauf: Lauf, now: number, wallNow: number): Lauf {
  let changed = false
  const bahnen = lauf.bahnen.map((bahn) => {
    if (bahn.startMs !== null) return bahn
    changed = true
    return { ...bahn, startMs: now }
  })
  if (!changed) return lauf
  return { ...lauf, bahnen, startWallMs: lauf.startWallMs ?? wallNow }
}

/**
 * Der zentrale Bedienschritt auf einer Kachel:
 * noch nicht gestartet → starten, läuft → Anschlag erfassen, beendet → nichts.
 */
export function tapLane(lauf: Lauf, bahnId: string, now: number, wallNow: number): Lauf {
  const bahn = findBahn(lauf, bahnId)
  if (!bahn) return lauf
  if (bahn.startMs === null) return startLane(lauf, bahnId, now, wallNow)
  if (isFinished(bahn)) return lauf

  const gesamt = lengthCount(lauf.konfiguration)
  const laengeNr = bahn.anschlaege.length + 1
  const istFinish = gesamt !== null && laengeNr >= gesamt
  const anschlag: Anschlag = {
    laengeNr,
    splitMs: Math.max(0, now - bahn.startMs),
    erfasstAt: wallNow,
    istFinish,
  }
  return updateBahn(lauf, bahnId, (b) => ({ ...b, anschlaege: [...b.anschlaege, anschlag] }))
}

/**
 * Beendet eine Bahn explizit. Nur bei offener Strecke nötig — bei konfigurierter
 * Strecke ergibt sich das Finish aus dem letzten Anschlag.
 */
export function finishLane(lauf: Lauf, bahnId: string, now: number, wallNow: number): Lauf {
  if (lengthCount(lauf.konfiguration) !== null) return lauf
  const bahn = findBahn(lauf, bahnId)
  if (!bahn || bahn.startMs === null || isFinished(bahn)) return lauf

  const anschlag: Anschlag = {
    laengeNr: bahn.anschlaege.length + 1,
    splitMs: Math.max(0, now - bahn.startMs),
    erfasstAt: wallNow,
    istFinish: true,
  }
  return updateBahn(lauf, bahnId, (b) => ({ ...b, anschlaege: [...b.anschlaege, anschlag] }))
}

/** Macht die letzte Aktion einer Bahn rückgängig: Anschlag löschen, sonst Start zurücknehmen. */
export function undoLane(lauf: Lauf, bahnId: string): Lauf {
  return updateBahn(lauf, bahnId, (bahn) => {
    if (bahn.anschlaege.length > 0) {
      return { ...bahn, anschlaege: bahn.anschlaege.slice(0, -1) }
    }
    if (bahn.startMs !== null) {
      return { ...bahn, startMs: null }
    }
    return bahn
  })
}

export function setSchwimmer(lauf: Lauf, bahnId: string, schwimmerId: string | null): Lauf {
  return updateBahn(lauf, bahnId, (bahn) =>
    bahn.schwimmerId === schwimmerId ? bahn : { ...bahn, schwimmerId },
  )
}

export function setSchwimmart(lauf: Lauf, schwimmart: Schwimmart): Lauf {
  if (lauf.konfiguration.schwimmart === schwimmart) return lauf
  return { ...lauf, konfiguration: { ...lauf.konfiguration, schwimmart } }
}

/** Beckenlänge und Strecke sind gesperrt, sobald der erste Anschlag erfasst wurde. */
export function isStreckeLocked(lauf: Lauf): boolean {
  return lauf.bahnen.some((bahn) => bahn.anschlaege.length > 0)
}

export function updateStrecke(
  lauf: Lauf,
  konfiguration: LaufKonfiguration,
): Lauf {
  if (isStreckeLocked(lauf)) return lauf
  if (validateKonfiguration(konfiguration) !== null) return lauf
  return { ...lauf, konfiguration: { ...konfiguration } }
}

/** True, sobald alle Bahnen ein Finish haben. */
export function isComplete(lauf: Lauf): boolean {
  return lauf.bahnen.every(isFinished)
}

/** True, sobald mindestens eine Bahn läuft oder beendet ist. */
export function hasStarted(lauf: Lauf): boolean {
  return lauf.bahnen.some((bahn) => bahn.startMs !== null)
}
