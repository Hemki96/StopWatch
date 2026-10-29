/**
 * Auswertung: Bestzeiten (PB), Deltas und Pace.
 *
 * Ein PB gilt je Kombination aus Schwimmer, Strecke, Schwimmart und
 * Beckenlänge. Kurzbahn und Langbahn sind bewusst getrennt (siehe
 * GLOSSARY.md), weil Zeiten auf 25 m und 50 m nicht vergleichbar sind. Offene
 * Strecken und Bahnen ohne Finish liefern kein PB.
 *
 * Die Funktionen sind rein und arbeiten auf bereits gemessenen Läufen; sie
 * verändern nichts und speichern nichts. `berechnePbs` ist eine
 * Momentaufnahme über die übergebenen Läufe, nicht der Bestand der App.
 */

import { finishMs } from './lauf'
import type { Bahn, Lauf, LaufKonfiguration } from './types'

/**
 * Ein PB-Eintrag mit Verweis auf die messende Bahn: `ms` ist die Bestzeit,
 * `laufId` und `bahnId` benennen die Quelle. `startWallMs` ist der
 * Wanduhr-Anker des Laufs und damit das Datum, weil `startMs` nur innerhalb
 * einer Seitensitzung gilt; ohne Anker steht dort 0.
 */
export interface PbEintrag {
  ms: number
  laufId: string
  bahnId: string
  startWallMs: number
}

/**
 * Ein PB gilt je (Schwimmer, Strecke, Schwimmart, Beckenlänge).
 * Kurzbahn und Langbahn sind bewusst getrennt — sie sind nicht vergleichbar.
 *
 * Offene Strecken bekommen den Platzhalter `offen`; sie erzeugen ohnehin kein
 * PB, der Schlüssel bleibt aber eindeutig.
 */
export function pbKey(konfiguration: LaufKonfiguration, schwimmerId: string): string {
  return [
    schwimmerId,
    konfiguration.streckeM ?? 'offen',
    konfiguration.schwimmart,
    konfiguration.beckenlaengeM,
  ].join('|')
}

/**
 * Berechnet je Schlüssel die schnellste Zielzeit über alle übergebenen Läufe.
 *
 * Übersprungen werden offene Strecken, Bahnen ohne Schwimmer und Bahnen ohne
 * Finish. Bei gleicher Zeit gewinnt der zuerst gesehene Lauf (strikt `<`), damit
 * das Ergebnis bei gleicher Eingabereihenfolge reproduzierbar bleibt. Ein von
 * Hand korrigierter Anschlag zählt mit; die Markierung `manuell` bleibt am
 * Anschlag und erscheint im CSV.
 */
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

/**
 * Vergleicht eine Bahn mit der gespeicherten Bestzeit derselben Kombination.
 *
 * `null`, wenn die Bahn keinen Schwimmer hat, die Strecke offen ist, kein
 * Finish vorliegt oder für den Schlüssel kein PB existiert. `deltaMs` ist
 * positiv, wenn die Zeit langsamer als das PB ist (0 bei Bestzeit).
 * `istPb` ist true, sobald die Zeit exakt dem gespeicherten Minimum entspricht;
 * bei zeitgleichen Zeiten trifft das auch auf den älteren Lauf zu.
 */
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
  // Zeitgleiche Bestzeiten sind beide Bestzeit; die Karte hält nur eine
  // Referenz, weil für den Delta-Wert eine reicht.
  return { deltaMs: ms - pb.ms, istPb: pb.ms === ms }
}

/**
 * Pace in Millisekunden pro 100 m, z. B. 60 000 für ein 1:00 auf 100 m.
 *
 * Es gibt keine Division-durch-0-Prüfung: `streckeM` muss positiv sein. Für
 * offene Strecken ist keine Pace definiert, Aufrufer lassen sie dort weg.
 */
export function pacePro100(ms: number, streckeM: number): number {
  return (ms / streckeM) * 100
}

/**
 * Kleinste Zielzeit aller Bahnen eines Laufs oder `null`, wenn noch keine Bahn
 * im Ziel ist. Gedacht für die Zusammenfassung im Verlauf, nicht als Wertung.
 */
export function schnellsteZeit(lauf: Lauf): number | null {
  const zeiten = lauf.bahnen
    .map((bahn) => finishMs(bahn))
    .filter((ms): ms is number => ms !== null)
  return zeiten.length > 0 ? Math.min(...zeiten) : null
}
