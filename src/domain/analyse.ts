import { finishMs } from './lauf'
import type { Bahn, Lauf, LaufKonfiguration } from './types'

export interface PbEintrag {
  ms: number
  laufId: string
  bahnId: string
  startWallMs: number
}

/**
 * Ein PB gilt je (Schwimmer, Strecke, Schwimmart, Beckenlänge).
 * Kurzbahn und Langbahn sind bewusst getrennt — sie sind nicht vergleichbar.
 */
export function pbKey(konfiguration: LaufKonfiguration, schwimmerId: string): string {
  return [
    schwimmerId,
    konfiguration.streckeM ?? 'offen',
    konfiguration.schwimmart,
    konfiguration.beckenlaengeM,
  ].join('|')
}

export function berechnePbs(laeufe: Lauf[]): Map<string, PbEintrag> {
  const pbs = new Map<string, PbEintrag>()
  for (const lauf of laeufe) {
    if (lauf.konfiguration.streckeM === null) continue
    for (const bahn of lauf.bahnen) {
      if (!bahn.schwimmerId) continue
      const ms = finishMs(bahn)
      if (ms === null) continue
      const key = pbKey(lauf.konfiguration, bahn.schwimmerId)
      const vorhanden = pbs.get(key)
      if (!vorhanden || ms < vorhanden.ms) {
        pbs.set(key, {
          ms,
          laufId: lauf.id,
          bahnId: bahn.id,
          startWallMs: lauf.startWallMs ?? 0,
        })
      }
    }
  }
  return pbs
}

export function pbDelta(
  pbs: Map<string, PbEintrag>,
  lauf: Lauf,
  bahn: Bahn,
): { deltaMs: number; istPb: boolean } | null {
  if (!bahn.schwimmerId || lauf.konfiguration.streckeM === null) return null
  const ms = finishMs(bahn)
  if (ms === null) return null
  const pb = pbs.get(pbKey(lauf.konfiguration, bahn.schwimmerId))
  if (!pb) return null
  return { deltaMs: ms - pb.ms, istPb: pb.bahnId === bahn.id }
}

/** Pace in Millisekunden pro 100 m. */
export function pacePro100(ms: number, streckeM: number): number {
  return (ms / streckeM) * 100
}

export function schnellsteZeit(lauf: Lauf): number | null {
  const zeiten = lauf.bahnen
    .map((bahn) => finishMs(bahn))
    .filter((ms): ms is number => ms !== null)
  return zeiten.length > 0 ? Math.min(...zeiten) : null
}
