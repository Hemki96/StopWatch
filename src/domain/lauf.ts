/**
 * Zeitkern eines Laufs: Start, Anschlag, Finish, Undo und Korrektur.
 *
 * Hier entstehen aus Taps messbare Zeiten. Alle Funktionen sind rein: Sie
 * bekommen die aktuelle Zeit als Argument (`now` aus `performance.now()` für
 * Messungen, `wallNow` aus `Date.now()` für den Wanduhr-Anker) und geben einen
 * neuen `Lauf` zurück. Ohne Wirkung kommt dasselbe Objekt zurück — daran
 * erkennt die Oberfläche, dass nichts zu speichern ist.
 *
 * Zentrale Invarianten: `startMs` wird pro Bahn höchstens einmal gesetzt,
 * `anschlaege` sind kumulativ ab Start der Bahn und nach `laengeNr` aufsteigend,
 * höchstens der letzte Anschlag trägt `istFinish`. Weil die Zeit aus
 * Zeitstempeln rekonstruiert wird, hängt sie weder am Rendering noch an einem
 * Timer; nach einem Reload sind `performance.now()`-Werte wertlos und werden
 * von der Persistenz zurückgesetzt.
 *
 * Zusammenhang: `serie.ts` fasst mehrere Läufe zu Runden zusammen,
 * `training.ts` erzeugt sie aus einem Plan.
 */

import { formatTime } from './format'
import { formatBeckenlaenge } from './einheit'
import { newId } from './id'
import type {
  Anschlag,
  Bahn,
  BahnStatus,
  Lauf,
  LaufKonfiguration,
  Schwimmart,
} from './types'

/** Eingabe für `createLauf`: Bahnnummer, Reihe und optionale Schwimmerzuordnung. */
export interface BahnInit {
  nummer: number
  /** Startgruppe ab 1; fehlt sie, startet die Bahn in Reihe 1. */
  reihe?: number
  schwimmerId?: string | null
}

/** Optionale Felder beim Anlegen eines Laufs. Fehlende Werte werden normalisiert. */
export interface LaufOptionen {
  startversatzMs?: number
  wiederholung?: number | null
}

/** Vorgabe für neue Läufe, wenn der Trainer nichts anderes gewählt hat. */
export const STANDARD_KONFIGURATION: LaufKonfiguration = {
  beckenlaengeM: 50,
  streckeM: 100,
  schwimmart: 'freistil',
}

/**
 * Obergrenze der selbst eingestellten Zwischenzeiten. Sie ist eine
 * Bedienentscheidung: Mehr Anschläge nimmt am Beckenrand niemand sinnvoll.
 * Der Wert muss zu `pruefeKonfiguration` in der Sicherung passen.
 */
export const MAX_ZWISCHENZEITEN = 99

/**
 * Strecke in Längen umgerechnet. Bei offener Strecke gibt es keine feste
 * Ziel-Länge, deshalb `null`.
 */
export function lengthCount(konfiguration: LaufKonfiguration): number | null {
  if (konfiguration.streckeM === null) return null
  return Math.round(konfiguration.streckeM / konfiguration.beckenlaengeM)
}

/**
 * Zahl der Zwischenzeiten, die sich aus Strecke und Beckenlänge ergibt. Die
 * letzte Länge ist das Ziel und zählt nicht mit; bei offener Strecke ist die
 * Zahl offen (`null`).
 */
export function automatischeZwischenzeiten(
  konfiguration: LaufKonfiguration,
): number | null {
  const laengen = lengthCount(konfiguration)
  return laengen === null ? null : Math.max(0, laengen - 1)
}

/**
 * Vom Trainer eingestellte Zwischenzeiten oder `null` für „automatisch“.
 * Unbrauchbare Werte (kein endlicher Wert, negativ) gelten als automatisch;
 * zu große Werte werden auf `MAX_ZWISCHENZEITEN` gekappt.
 */
export function eingestellteZwischenzeiten(
  konfiguration: LaufKonfiguration,
): number | null {
  const wert = konfiguration.zwischenzeiten
  if (typeof wert !== 'number' || !Number.isFinite(wert)) return null
  return Math.min(MAX_ZWISCHENZEITEN, Math.max(0, Math.round(wert)))
}

/**
 * Zahl der Zwischenzeiten bis zum Ziel. `null` heißt offen: Bei einer offenen
 * Strecke ohne eigene Vorgabe bestimmt der Trainer das Ziel mit einem Knopf.
 * Die folgende Zahl ist immer der Ziel-Anschlag (`gesamt + 1`).
 */
export function zwischenzeitenGesamt(
  konfiguration: LaufKonfiguration,
): number | null {
  return eingestellteZwischenzeiten(konfiguration) ?? automatischeZwischenzeiten(konfiguration)
}

/**
 * True, wenn die Strecke ein Vielfaches der Beckenlänge ist. Der Vergleich
 * arbeitet mit einer kleinen Toleranz, weil Yard-Becken kanonisch 22,86 m lang
 * sind und 91,44 / 22,86 in Gleitkomma nicht exakt 4 ergibt.
 */
export function istVielfacheDerBeckenlaenge(
  streckeM: number,
  beckenlaengeM: number,
): boolean {
  if (!Number.isFinite(streckeM) || !Number.isFinite(beckenlaengeM) || beckenlaengeM <= 0) {
    return false
  }
  const laengen = streckeM / beckenlaengeM
  return Math.abs(laengen - Math.round(laengen)) < 1e-9
}

/**
 * Prüft eine Streckenkonfiguration und liefert eine deutsche Fehlermeldung oder
 * `null`, wenn alles gültig ist. Eine offene Strecke ist immer gültig.
 *
 * Geprüft wird nur die Strecke: Dass die Beckenlänge 25 oder 50 m ist, sichert
 * bereits der Typ `Beckenlaenge` ab.
 */
export function validateKonfiguration(konfiguration: LaufKonfiguration): string | null {
  const zwischenzeitenFehler = pruefeZwischenzeiten(konfiguration)
  if (zwischenzeitenFehler !== null) return zwischenzeitenFehler
  if (konfiguration.streckeM === null) return null
  if (!Number.isFinite(konfiguration.streckeM) || konfiguration.streckeM <= 0) {
    return 'Die Strecke muss größer als 0 m sein.'
  }
  if (!istVielfacheDerBeckenlaenge(konfiguration.streckeM, konfiguration.beckenlaengeM)) {
    return `Die Strecke muss ein Vielfaches der Beckenlänge (${formatBeckenlaenge(
      konfiguration.beckenlaengeM,
      konfiguration.einheit === 'yd' ? 'yd' : 'm',
    )}) sein.`
  }
  return null
}

/**
 * Prüft die Zahl der eingestellten Zwischenzeiten. `null`/fehlend bedeutet
 * automatisch und ist immer gültig.
 */
function pruefeZwischenzeiten(konfiguration: LaufKonfiguration): string | null {
  const wert = konfiguration.zwischenzeiten
  if (wert === undefined || wert === null) return null
  if (!Number.isInteger(wert) || wert < 0 || wert > MAX_ZWISCHENZEITEN) {
    return `Die Zwischenzeiten müssen zwischen 0 und ${MAX_ZWISCHENZEITEN} liegen.`
  }
  return null
}

/**
 * Legt einen neuen, noch nicht gestarteten Lauf an. Alle Bahnen sind „bereit“
 * (`startMs: null`) und haben keine Anschläge.
 *
 * `startversatzMs` wird auf eine ganze, nicht negative Zahl gerundet;
 * unbrauchbare Werte (fehlend, `NaN`) werden zu 0. `wiederholung` bleibt sonst
 * `null`. Eine fehlende oder unbrauchbare Reihe wird zu 1.
 */
export function createLauf(
  konfiguration: LaufKonfiguration,
  bahnen: BahnInit[],
  satzId: string | null = null,
  optionen: LaufOptionen = {},
): Lauf {
  return {
    id: newId(),
    satzId,
    konfiguration: { ...konfiguration },
    startWallMs: null,
    startversatzMs: Number.isFinite(optionen.startversatzMs)
      ? Math.max(0, Math.round(optionen.startversatzMs ?? 0))
      : 0,
    wiederholung: optionen.wiederholung ?? null,
    bahnen: bahnen.map((b) => ({
      id: newId(),
      nummer: b.nummer,
      reihe: normalisiereReihe(b.reihe),
      schwimmerId: b.schwimmerId ?? null,
      startMs: null,
      anschlaege: [],
    })),
  }
}

/** Eine Reihe ist 1-basiert; fehlende oder unbrauchbare Werte gelten als 1. */
export function normalisiereReihe(reihe: number | null | undefined): number {
  return Number.isFinite(reihe) ? Math.max(1, Math.round(reihe as number)) : 1
}

/** Die Reihe einer Bahn; ältere Datensätze ohne Feld gelten als Reihe 1. */
export function bahnReihe(bahn: Bahn): number {
  return normalisiereReihe(bahn.reihe)
}

/** Höchste Reihe eines Laufs; ohne Bahnen bleibt es bei 1. */
export function reihenVon(lauf: Lauf): number {
  return lauf.bahnen.reduce((hoechste, bahn) => Math.max(hoechste, bahnReihe(bahn)), 1)
}

/**
 * Gruppiert Bahnen nach ihrer Reihe, Reihen aufsteigend. Innerhalb einer Reihe
 * bleibt die übergebene Reihenfolge erhalten. Die Oberfläche zeigt je Gruppe
 * einen Abschnitt; die Domain braucht die Gruppierung nur für Startzeiten.
 */
export function bahnenNachReihen<T extends { reihe: number }>(
  bahnen: T[],
): { reihe: number; bahnen: T[] }[] {
  const gruppen = new Map<number, T[]>()
  for (const eintrag of bahnen) {
    const reihe = normalisiereReihe(eintrag.reihe)
    const liste = gruppen.get(reihe)
    if (liste) liste.push(eintrag)
    else gruppen.set(reihe, [eintrag])
  }
  return [...gruppen.entries()]
    .sort(([a], [b]) => a - b)
    .map(([reihe, liste]) => ({ reihe, bahnen: liste }))
}

/**
 * True, wenn die Bahn einen Finish-Anschlag hat. Ein Finish beendet die Bahn;
 * weitere Taps ändern dann nichts mehr.
 */
export function isFinished(bahn: Bahn): boolean {
  return bahn.anschlaege.some((a) => a.istFinish)
}

/**
 * True, wenn die Bahn abgeschlossen ist — durch ein Ziel. Ein Finish ist
 * endgültig: Weitere Anschläge und Starts ändern nichts mehr.
 */
export function istBahnBeendet(bahn: Bahn): boolean {
  return isFinished(bahn)
}

/**
 * Status ohne Zeitbezug: kennt kein „geplant“, weil dafür `now` fehlt. Eine
 * Bahn mit Startzeit in der Zukunft gilt hier als laufend; für die Anzeige mit
 * Countdown ist `laneStatusAt` die richtige Wahl.
 */
export function laneStatus(bahn: Bahn): BahnStatus {
  if (istBahnBeendet(bahn)) return 'beendet'
  if (bahn.startMs === null) return 'bereit'
  return 'laeuft'
}

/**
 * Status zum Zeitpunkt `now`. Eine Bahn mit Startzeit in der Zukunft ist
 * „geplant“ und darf noch keine Anschläge annehmen.
 */
export function laneStatusAt(bahn: Bahn, now: number): BahnStatus {
  if (istBahnBeendet(bahn)) return 'beendet'
  if (bahn.startMs === null) return 'bereit'
  if (now < bahn.startMs) return 'geplant'
  return 'laeuft'
}

/** Verstrichene Zeit seit dem Start der Bahn; vor dem Start und bei negativem Abstand 0. */
export function elapsedMs(bahn: Bahn, now: number): number {
  if (bahn.startMs === null) return 0
  return Math.max(0, now - bahn.startMs)
}

/** Endzeit der Bahn, sofern sie beendet ist. */
export function finishMs(bahn: Bahn): number | null {
  const finish = bahn.anschlaege.find((a) => a.istFinish)
  return finish ? finish.splitMs : null
}

/**
 * Verstrichene Laufzeit eines Laufs ab dem ersten Start.
 *
 * Grundlage ist die früheste Startzeit aller Bahnen. Damit beginnt die Zeit
 * beim ersten Start und enthält den Startversatz der übrigen Reihen, statt für
 * jede Reihe neu zu beginnen. Solange nicht alle Bahnen im Ziel sind, läuft die
 * Anzeige mit `now` weiter; nach dem letzten Ziel bleibt der Wert stehen und
 * ändert sich nicht mehr mit der Uhr.
 *
 * `null`, solange keine Bahn gestartet ist — ohne Start gibt es keine Laufzeit.
 * Eine Bahn ohne Startzeit zählt beim Einfrieren nicht mit; ihr fehlt der
 * Bezugspunkt.
 */
export function laufzeitMs(lauf: Lauf, now: number): number | null {
  const starts = lauf.bahnen
    .map((bahn) => bahn.startMs)
    .filter((start): start is number => start !== null)
  if (starts.length === 0) return null
  const beginn = Math.min(...starts)
  // Nur wenn jede Bahn ein Finish hat, friert die Anzeige ein. Eine offene
  // Bahn hält sie am Laufen, auch wenn andere schon im Ziel sind.
  if (!lauf.bahnen.every(isFinished)) return Math.max(0, now - beginn)
  const letztesZiel = Math.max(
    ...lauf.bahnen.map((bahn) => (bahn.startMs ?? beginn) + (finishMs(bahn) ?? 0)),
  )
  return Math.max(0, letztesZiel - beginn)
}

/** Letzter Anschlag, unabhängig davon ob er das Finish ist. */
export function lastSplit(bahn: Bahn): Anschlag | null {
  return bahn.anschlaege.at(-1) ?? null
}

/** Stand der Zwischenzeiten einer Bahn: bereits erfasst und bis zum Ziel. */
export interface ZwischenzeitStand {
  /** Erfasste Zwischenzeiten; ein Ziel-Anschlag zählt nicht mit. */
  erfasst: number
  /** Zwischenzeiten bis zum Ziel, `null` bei offener Strecke. */
  gesamt: number | null
}

/**
 * Zählt die Zwischenzeiten einer Bahn. Die Zahl bis zum Ziel stammt aus der
 * Konfiguration: entweder vom Trainer eingestellt oder aus den Längen
 * abgeleitet. Ist sie offen (`null`), bleibt die Gesamtzahl offen. Automatisch
 * hat ein Lauf über genau eine Beckenlänge deshalb `gesamt: 0` — dort gibt es
 * keine Zwischenzeit.
 */
export function zwischenzeiten(
  bahn: Bahn,
  konfiguration: LaufKonfiguration,
): ZwischenzeitStand {
  return {
    erfasst: bahn.anschlaege.filter((anschlag) => !anschlag.istFinish).length,
    gesamt: zwischenzeitenGesamt(konfiguration),
  }
}

/** Sucht eine Bahn per ID; `undefined`, wenn sie nicht (mehr) existiert. */
export function findBahn(lauf: Lauf, bahnId: string): Bahn | undefined {
  return lauf.bahnen.find((b) => b.id === bahnId)
}

/**
 * Wendet eine Änderung auf genau eine Bahn an, ohne den Rest anzufassen.
 *
 * Die Funktion erwartet, dass `update` bei fehlender Änderung dieselbe
 * Bahn-Referenz zurückgibt. Nur so lässt sich erkennen, ob überhaupt etwas
 * passiert ist: Dann kommt der ursprüngliche `Lauf` zurück, sonst ein neuer mit
 * ausgetauschtem Bahnen-Array.
 */
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

/**
 * Startet eine Bahn. Bereits gestartete oder beendete Bahnen bleiben unverändert.
 *
 * `startWallMs` wird nur gesetzt, wenn der Lauf noch keinen Anker hat: Der erste
 * Start eines Laufs bestimmt die Wanduhr-Zeit, die im Verlauf und im CSV steht.
 * Die Startzeit selbst kommt aus `now` (monotone Uhr) und ist damit unabhängig
 * von einer Zeitumstellung.
 */
export function startLane(lauf: Lauf, bahnId: string, now: number, wallNow: number): Lauf {
  const next = updateBahn(lauf, bahnId, (bahn) =>
    bahn.startMs === null && bahn.anschlaege.length === 0 ? { ...bahn, startMs: now } : bahn,
  )
  // Keine Änderung (unbekannte oder bereits gestartete Bahn): Anker nicht anfassen.
  if (next === lauf) return lauf
  return { ...next, startWallMs: lauf.startWallMs ?? wallNow }
}

/**
 * Setzt die Startzeitpunkte einer unberührten Bahnfolge: Alle Bahnen einer
 * Reihe starten gemeinsam, jede weitere Reihe um `versatzMs` später. Der
 * Versatz wird am Lauf gespeichert, damit ein Neustart derselben Bahnen dieselbe
 * Staffelung ergibt.
 *
 * Achtung: Bereits gesetzte Startzeiten werden überschrieben. Aufrufer müssen
 * sicherstellen, dass die Bahnen noch unberührt sind; `AppProvider` plant so
 * nur unberührte Serienrunden.
 */
export function planeLauf(
  lauf: Lauf,
  startMs: number,
  wallStartMs: number,
  versatzMs: number = lauf.startversatzMs ?? 0,
): Lauf {
  // Versatz normalisieren wie in `createLauf`: ganzzahlig und nicht negativ.
  const abstand = Number.isFinite(versatzMs) ? Math.max(0, Math.round(versatzMs)) : 0
  return {
    ...lauf,
    startversatzMs: abstand,
    startWallMs: wallStartMs,
    bahnen: lauf.bahnen.map((bahn) => ({
      ...bahn,
      startMs: startMs + (bahnReihe(bahn) - 1) * abstand,
    })),
  }
}

/**
 * Verschiebt die Startzeitpunkte eines Laufs auf die monotone Uhr eines
 * anderen Tabs.
 *
 * `performance.now()` hat pro Dokument einen eigenen Nullpunkt. Ein Lauf, den
 * Tab A gestartet hat, ist in Tab B deshalb nicht direkt weiterführbar. Der
 * Wanduhr-Anker `startWallMs` und der früheste Start bilden jedoch eine
 * origin-unabhängige Zeitbasis: Für jede Bahn gilt
 *
 *   Wanduhr-Start = startWallMs + (startMs - frühester Start)
 *
 * Daraus wird mit der neuen monotonen und der neuen Wanduhr der Startwert im
 * neuen Dokument berechnet. Abstände zwischen Bahnen und Reihen bleiben
 * erhalten; bereits beendete Bahnen behalten ihre Anschläge.
 *
 * Ohne Wanduhr-Anker oder ohne gestartete Bahn gibt es nichts zu verschieben —
 * dann kommt derselbe Lauf zurück. Negative neue Startwerte sind gültig: Sie
 * bedeuten lediglich, dass die Bahn vor dem Nullpunkt dieses Dokuments
 * gestartet wurde.
 */
export function rebaseLauf(lauf: Lauf, now: number, wallNow: number): Lauf {
  if (lauf.startWallMs === null) return lauf
  if (!Number.isFinite(now) || !Number.isFinite(wallNow)) return lauf
  const starts = lauf.bahnen
    .map((bahn) => bahn.startMs)
    .filter((start): start is number => start !== null)
  if (starts.length === 0) return lauf

  const fruehesterStart = Math.min(...starts)
  const versatz = lauf.startWallMs - fruehesterStart
  return {
    ...lauf,
    bahnen: lauf.bahnen.map((bahn) =>
      bahn.startMs === null
        ? bahn
        : { ...bahn, startMs: now + (bahn.startMs + versatz - wallNow) },
    ),
  }
}

/**
 * Startet alle noch nicht gestarteten Bahnen, gestaffelt nach ihrer Reihe.
 *
 * Der Versatz richtet sich nach der Reihe, nicht nach der Bahnposition: Reihe 2
 * bekommt `now + Versatz`, auch wenn Reihe 1 schon vorher einzeln gestartet
 * wurde. Der Wanduhr-Anker bleibt erhalten, wenn er bereits gesetzt ist; ist
 * nichts zu tun, kommt derselbe Lauf zurück.
 */
export function startAll(lauf: Lauf, now: number, wallNow: number): Lauf {
  const versatz = Number.isFinite(lauf.startversatzMs)
    ? Math.max(0, Math.round(lauf.startversatzMs ?? 0))
    : 0
  let changed = false
  const bahnen = lauf.bahnen.map((bahn) => {
    // Eine Bahn mit Anschlägen, aber ohne Startzeit ist nach einem Reload
    // unterbrochen: Ihr fehlt der monotone Bezugspunkt. Ein Neustart würde die
    // alten Splits mit einer neuen Startzeit vermischen und ein falsches Finish
    // erzeugen; deshalb bleibt sie stehen, bis sie zurückgesetzt wird.
    if (bahn.startMs !== null || istBahnBeendet(bahn) || bahn.anschlaege.length > 0) return bahn
    changed = true
    return { ...bahn, startMs: now + (bahnReihe(bahn) - 1) * versatz }
  })
  if (!changed) return lauf
  return { ...lauf, bahnen, startWallMs: lauf.startWallMs ?? wallNow }
}

/**
 * Der zentrale Bedienschritt auf einer Kachel:
 * noch nicht gestartet → starten, läuft → Anschlag erfassen, beendet → nichts.
 * Eine geplante Bahn ignoriert Taps, bis ihr Startzeitpunkt erreicht ist.
 *
 * Die Reihenfolge der Prüfungen ist wichtig: Zuerst wird gestartet, dann der
 * Countdown geprüft, dann das Finish. So startet der erste Tap eine bereite
 * Bahn, ohne dass ein Anschlag entsteht.
 */
export function tapLane(lauf: Lauf, bahnId: string, now: number, wallNow: number): Lauf {
  const bahn = findBahn(lauf, bahnId)
  if (!bahn) return lauf
  // Unterbrochene Bahn (Splits ohne Startzeit): Ein Neustart würde die alten
  // Splits mit einer neuen Startzeit vermischen. Sie muss erst zurückgesetzt
  // werden; ein einfacher Tap ändert nichts.
  if (bahn.startMs === null) {
    return bahn.anschlaege.length > 0 ? lauf : startLane(lauf, bahnId, now, wallNow)
  }
  // Geplante Bahn (Startversatz): Der Tap wird ignoriert, bis der
  // Startzeitpunkt erreicht ist.
  if (now < bahn.startMs) return lauf
  if (isFinished(bahn)) return lauf

  const gesamt = zwischenzeitenGesamt(lauf.konfiguration)
  const laengeNr = bahn.anschlaege.length + 1
  // Der Anschlag nach allen Zwischenzeiten ist das Ziel. Das gilt auch für eine
  // offene Strecke, sobald der Trainer dort eine feste Zahl eingestellt hat;
  // ohne Vorgabe bleibt jeder Anschlag ein Split.
  const istFinish = gesamt !== null && laengeNr > gesamt
  const anschlag: Anschlag = {
    laengeNr,
    splitMs: Math.max(0, now - bahn.startMs),
    erfasstAt: wallNow,
    istFinish,
  }
  return updateBahn(lauf, bahnId, (b) => ({ ...b, anschlaege: [...b.anschlaege, anschlag] }))
}

/**
 * Beendet eine Bahn explizit. Nur bei offener Strecke ohne eigene
 * Zwischenzeiten nötig — bei fester Strecke oder eingestellter Anzahl ergibt
 * sich das Finish aus dem letzten Anschlag, dort ist der Aufruf wirkungslos.
 *
 * Verlangt eine gestartete, noch offene Bahn mit `now >= startMs`; sonst kommt
 * der Lauf unverändert zurück. Der neue Anschlag trägt `istFinish: true`.
 */
export function finishLane(lauf: Lauf, bahnId: string, now: number, wallNow: number): Lauf {
  if (zwischenzeitenGesamt(lauf.konfiguration) !== null) return lauf
  const bahn = findBahn(lauf, bahnId)
  if (!bahn || bahn.startMs === null || now < bahn.startMs || isFinished(bahn)) {
    return lauf
  }

  const anschlag: Anschlag = {
    // Auch bei offener Strecke fortlaufend nummeriert; die Länge ist hier nur
    // die Reihenfolge der Anschläge, keine Metermarke.
    laengeNr: bahn.anschlaege.length + 1,
    splitMs: Math.max(0, now - bahn.startMs),
    erfasstAt: wallNow,
    istFinish: true,
  }
  return updateBahn(lauf, bahnId, (b) => ({ ...b, anschlaege: [...b.anschlaege, anschlag] }))
}

/**
 * Macht die letzte Aktion einer Bahn rückgängig: Anschlag löschen, sonst Start
 * zurücknehmen. Eine unberührte Bahn bleibt unverändert.
 *
 * `startWallMs` des Laufs wird bewusst nicht zurückgesetzt — der Wanduhr-Anker
 * gehört zum Lauf, nicht zur einzelnen Bahn. Undo entfernt immer genau einen
 * Schritt, damit ein versehentlicher Doppeltap korrigierbar bleibt.
 */
export function undoLane(lauf: Lauf, bahnId: string): Lauf {
  return updateBahn(lauf, bahnId, (bahn) => {
    if (bahn.anschlaege.length > 0) {
      // Ein Finish verliert damit seine Wirkung: Die Bahn läuft wieder.
      return { ...bahn, anschlaege: bahn.anschlaege.slice(0, -1) }
    }
    if (bahn.startMs !== null) {
      return { ...bahn, startMs: null }
    }
    return bahn
  })
}

/**
 * Ordnet einer Bahn einen Schwimmer zu oder entfernt die Zuordnung (`null`).
 * Ohne echte Änderung kommt derselbe Lauf zurück.
 */
export function setSchwimmer(lauf: Lauf, bahnId: string, schwimmerId: string | null): Lauf {
  return updateBahn(lauf, bahnId, (bahn) =>
    bahn.schwimmerId === schwimmerId ? bahn : { ...bahn, schwimmerId },
  )
}

/**
 * Ändert die Schwimmart des Laufs. Der zugehörige `Satz` wird nicht
 * mitgeschrieben: Für Anzeige und Bestzeiten zählt die Konfiguration im Lauf.
 * Die Strecke bleibt unverändert, deshalb ist keine Sperre nötig.
 */
export function setSchwimmart(lauf: Lauf, schwimmart: Schwimmart): Lauf {
  if (lauf.konfiguration.schwimmart === schwimmart) return lauf
  return { ...lauf, konfiguration: { ...lauf.konfiguration, schwimmart } }
}

/**
 * Prüft eine nachträgliche Korrektur. Splits sind kumulativ; eine Korrektur darf
 * die Reihenfolge nicht brechen, aber sie verschiebt keine folgenden Zeiten
 * (keine Kaskade).
 *
 * Rückgabe ist eine deutsche Meldung für die Oberfläche oder `null`. Der
 * Anschlag wird über `laengeNr` gesucht, nicht über den Array-Index, damit die
 * Prüfung zur Anzeige passt.
 */
export function pruefeAnschlagKorrektur(
  lauf: Lauf,
  bahnId: string,
  laengeNr: number,
  splitMs: number,
): string | null {
  const bahn = findBahn(lauf, bahnId)
  if (!bahn) return 'Bahn nicht gefunden.'
  if (!Number.isFinite(splitMs) || splitMs < 0) return 'Die Zeit muss eine positive Dauer sein.'
  const index = bahn.anschlaege.findIndex((a) => a.laengeNr === laengeNr)
  if (index === -1) return 'Anschlag nicht gefunden.'
  const vorher = bahn.anschlaege[index - 1]
  const nachher = bahn.anschlaege[index + 1]
  if (vorher && splitMs <= vorher.splitMs) {
    return `Die Zeit muss nach dem vorherigen Anschlag (${formatTime(vorher.splitMs)}) liegen.`
  }
  if (nachher && splitMs >= nachher.splitMs) {
    return `Die Zeit muss vor dem nächsten Anschlag (${formatTime(nachher.splitMs)}) liegen.`
  }
  return null
}

/**
 * Korrigiert genau einen Anschlag. Das Finish-Flag des Anschlags bleibt
 * erhalten; ein Zwischenanschlag wird nie zum Finish. Die Korrektur wird als
 * `manuell` markiert, damit CSV und Bestzeiten nachvollziehbar bleiben.
 *
 * Schlägt `pruefeAnschlagKorrektur` fehl, kommt der Lauf unverändert zurück. Die
 * Zeit wird auf ganze Millisekunden abgeschnitten, passend zur Anzeige.
 */
export function korrigiereAnschlag(
  lauf: Lauf,
  bahnId: string,
  laengeNr: number,
  splitMs: number,
): Lauf {
  if (pruefeAnschlagKorrektur(lauf, bahnId, laengeNr, splitMs) !== null) return lauf
  return updateBahn(lauf, bahnId, (bahn) => ({
    ...bahn,
    anschlaege: bahn.anschlaege.map((anschlag) =>
      anschlag.laengeNr === laengeNr
        ? { ...anschlag, splitMs: Math.trunc(splitMs), manuell: true }
        : anschlag,
    ),
  }))
}

/** Beckenlänge und Strecke sind gesperrt, sobald der erste Anschlag erfasst wurde. */
export function isStreckeLocked(lauf: Lauf): boolean {
  return lauf.bahnen.some((bahn) => bahn.anschlaege.length > 0)
}

/** Startversatz und Serienplan sind gesperrt, sobald irgendeine Bahn gestartet ist. */
export function isStartLocked(lauf: Lauf): boolean {
  return lauf.bahnen.some((bahn) => bahn.startMs !== null || bahn.anschlaege.length > 0)
}

/**
 * Ändert Beckenlänge, Strecke und Schwimmart gemeinsam. Das ist nur vor dem
 * ersten Anschlag möglich (`isStreckeLocked`) und nur mit gültiger
 * Konfiguration; sonst bleibt der Lauf unverändert.
 *
 * Ein bereits gestarteter, aber noch nicht angeschlagener Lauf darf die Strecke
 * noch wechseln: Die Startzeit bleibt gültig, nur die Zahl der Längen ändert
 * sich.
 */
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
  return lauf.bahnen.every(istBahnBeendet)
}

/**
 * True, solange mindestens eine Bahn auf ihren Start wartet oder läuft. Nur
 * dann ist ein Neuladen teuer: Ein angelegter Lauf ohne Start oder ein
 * vollständig beendeter Lauf kann gefahrlos durch eine neue Version ersetzt
 * werden. Geplante, aber noch nicht gestartete Bahnen zählen mit, weil ihr
 * Countdown sonst einfriert.
 */
export function hatLaufendeBahn(lauf: Lauf | null | undefined): boolean {
  return lauf?.bahnen.some((bahn) => bahn.startMs !== null && !istBahnBeendet(bahn)) ?? false
}

/** True, sobald mindestens eine Bahn gestartet oder geplant ist (`startMs` gesetzt). */
export function hasStarted(lauf: Lauf): boolean {
  return lauf.bahnen.some((bahn) => bahn.startMs !== null)
}

/**
 * True, sobald ein Lauf im Verlauf auftauchen soll. Maßgeblich ist die
 * Wanduhr (`startWallMs`), nicht `performance.now()`: Nur die Wanduhr ist
 * zwischen Tabs und nach einem Reload vergleichbar.
 *
 * Die erste Wiederholung einer Serie erscheint schon mit ihrem Start, damit
 * ein laufender Lauf ohne Anschläge nicht aus dem Verlauf verschwindet.
 * Spätere Wiederholungen erscheinen erst mit dem ersten Anschlag — sonst
 * würden nach einem langen Reload alle nur geplanten Runden als
 * „unvollständig“ auftauchen.
 *
 * Ohne zweites Argument wird die aktuelle Wanduhr (`Date.now()`) verwendet.
 */
export function hatBegonnen(lauf: Lauf, wallNow: number = Date.now()): boolean {
  if (lauf.bahnen.some((bahn) => bahn.anschlaege.length > 0)) return true
  if (lauf.startWallMs === null || lauf.startWallMs > wallNow) return false
  return lauf.wiederholung === null || lauf.wiederholung === 1
}
