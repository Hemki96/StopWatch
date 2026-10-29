/**
 * Runden einer Serie und die Zeile pro Schwimmer.
 *
 * Eine Serie ist kein eigenes Objekt, sondern ein `Satz` mit `plan` und mehrere
 * `Lauf`-Wiederholungen (siehe GLOSSARY.md). Diese Datei verdichtet diese
 * Wiederholungen für die Serien-Ansicht: `bahnZeile` fasst pro Bahnindex alle
 * Runden zu einer Zeile zusammen, `zeilenZeit` liefert die große Zahl darin.
 *
 * Es gibt keinen Timer, der eine Runde nachholt: Alle Startzeiten stehen beim
 * Start der Serie fest (ADR 0005). Überlappende Runden sind deshalb erlaubt und
 * werden als überfällig markiert, statt versteckt zu werden. Ein Tap schließt
 * immer die älteste offene Runde.
 *
 * Die Funktionen erwarten Läufe, die mit `runden` nach Wiederholungsnummer
 * sortiert sind; die Reihenfolge bestimmt, welche Runde als älteste gilt.
 */

import { finishMs, isComplete, isFinished } from './lauf'
import type { Bahn, Lauf, Satz, SatzPlan } from './types'

/** Ein Satz ist eine Serie, sobald er mehr als eine Wiederholung plant. */
export function istSerie(satz: Satz | null | undefined): boolean {
  return (satz?.plan?.wiederholungen ?? 1) > 1
}

/**
 * Alle Wiederholungen eines Satzes, nach Wiederholungsnummer sortiert.
 *
 * Läufe ohne Nummer (`null`) landen durch `?? 0` vorn. Ohne `satzId` gibt es
 * keine Runden; dann fehlt dem Aufrufer der Satz, zu dem die Läufe gehören.
 */
export function runden(laeufe: Lauf[], satzId: string | null): Lauf[] {
  if (!satzId) return []
  // `filter` erzeugt eine Kopie, `sort` mutiert also nicht das Eingabe-Array.
  return laeufe
    .filter((lauf) => lauf.satzId === satzId)
    .sort((a, b) => (a.wiederholung ?? 0) - (b.wiederholung ?? 0))
}

/** Eine Runde bezogen auf eine einzelne Bahn: der Lauf und seine Bahn. */
export interface BahnRunde {
  lauf: Lauf
  bahn: Bahn
}

/**
 * Zustand einer Serienzeile. `ueberfaellig` heißt: Mehr als eine Runde ist
 * offen, die nächste ist also gestartet, bevor die vorige im Ziel war.
 */
export type ZeilenStatus = 'bereit' | 'geplant' | 'laeuft' | 'ueberfaellig' | 'fertig'

/**
 * Eine Zeile der Serien-Ansicht, also alle Runden eines Bahnindex verdichtet.
 *
 * Die Felder sind bewusst redundant: `offen` ist immer `offene[0]`, und
 * `anzeigeRunde` erspart der Oberfläche die Fallunterscheidung.
 */
export interface BahnZeile {
  index: number
  /** Älteste gestartete, noch offene Runde. Ein Tap schließt genau sie. */
  offen: BahnRunde | null
  /** Alle offenen Runden. Mehr als eine heißt: eine neuere Runde läuft schon. */
  offene: BahnRunde[]
  /** Nächste Runde, deren Start noch aussteht. */
  naechste: BahnRunde | null
  /** Letzte beendete Runde. */
  letzte: BahnRunde | null
  /** Die Runde, die die Zeile gerade beschreibt. */
  anzeigeRunde: number | null
  status: ZeilenStatus
}

/**
 * Verdichtet die Runden einer Serie auf eine Zeile pro Schwimmer. Der Trainer
 * tippt immer die älteste offene Runde; dadurch bleiben überholte Runden
 * sichtbar, statt stillschweigend zu verschwinden.
 *
 * `index` ist die Position der Bahn innerhalb jedes Laufs, nicht die
 * Bahnnummer. Läufe ohne eine Bahn an dieser Position werden übersprungen, damit
 * eine unvollständige Serie die Anzeige nicht verschiebt.
 *
 * Statuspriorität: mehr als eine offene Runde → `ueberfaellig`, sonst offen →
 * `laeuft`, sonst geplante → `geplant`, sonst beendete → `fertig`, sonst
 * `bereit`.
 */
export function bahnZeile(laeufe: Lauf[], index: number, now: number): BahnZeile {
  const offene: BahnRunde[] = []
  let naechste: BahnRunde | null = null
  let letzte: BahnRunde | null = null

  for (const lauf of laeufe) {
    const bahn = lauf.bahnen[index]
    if (!bahn) continue
    if (isFinished(bahn)) {
      // Jede beendete Runde überschreibt den vorherigen Treffer: `letzte` ist
      // damit die letzte beendete Runde in der Reihenfolge der übergebenen
      // Läufe (bei sortierten Runden: die höchste beendete).
      letzte = { lauf, bahn }
      continue
    }
    if (bahn.startMs === null) continue
    if (now < bahn.startMs) {
      // Nur die erste geplante Runde ist interessant; spätere liegen weiter
      // in der Zukunft und wären als Countdown irreführend.
      if (!naechste) naechste = { lauf, bahn }
      continue
    }
    offene.push({ lauf, bahn })
  }

  const offen = offene[0] ?? null
  const status: ZeilenStatus =
    offene.length > 1
      ? 'ueberfaellig'
      : offen
        ? 'laeuft'
        : naechste
          ? 'geplant'
          : letzte
            ? 'fertig'
            : 'bereit'

  return {
    index,
    offen,
    offene,
    naechste,
    letzte,
    anzeigeRunde: offen?.lauf.wiederholung ?? naechste?.lauf.wiederholung ?? letzte?.lauf.wiederholung ?? null,
    status,
  }
}

/** Zeit, die in der Zeile groß steht: laufend, Countdown oder Zielzeit. */
export function zeilenZeit(zeile: BahnZeile, now: number): number {
  // Laufende Runde: verstrichene Zeit seit dem Start dieser Runde. Der Rückfall
  // auf `now` fängt nur den theoretischen Fall einer fehlenden Startzeit ab.
  if (zeile.offen) return Math.max(0, now - (zeile.offen.bahn.startMs ?? now))
  // Noch nicht gestartete Runde: Restzeit bis zum Start, nie negativ.
  if (zeile.naechste) return Math.max(0, (zeile.naechste.bahn.startMs ?? now) - now)
  // Sonst die letzte Zielzeit; fehlt sie, bleibt die Anzeige bei 0.
  if (zeile.letzte) return finishMs(zeile.letzte.bahn) ?? 0
  return 0
}

/** Anzahl der Runden, in denen alle Bahnen im Ziel sind. */
export function serieFortschritt(laeufe: Lauf[]): { fertig: number; gesamt: number } {
  return {
    fertig: laeufe.filter(isComplete).length,
    gesamt: laeufe.length,
  }
}

/**
 * Die höchste Runde, die zum Zeitpunkt `now` irgendwo schon gestartet ist.
 * Bei einer Serie mit festem Takt ist das die Runde, die gerade im Becken ist.
 *
 * `0` heißt: noch keine Runde gestartet. Läufe ohne Wiederholungsnummer werden
 * ignoriert, weil sie zu keiner Runde gehören.
 */
export function aktuelleRunde(laeufe: Lauf[], now: number): number {
  let hoechste = 0
  for (const lauf of laeufe) {
    if (lauf.wiederholung === null) continue
    // Eine geplante Bahn zählt erst ab ihrem Startzeitpunkt als gestartet.
    if (lauf.bahnen.some((bahn) => bahn.startMs !== null && bahn.startMs <= now)) {
      hoechste = Math.max(hoechste, lauf.wiederholung)
    }
  }
  return hoechste
}

/**
 * Die Runde, deren letzter Anschlag am jüngsten ist. Für „rückgängig“ zählt
 * die tatsächliche Bedienreihenfolge, nicht die Rundennummer.
 *
 * Verglichen wird `erfasstAt` (Wanduhr), weil nur dieser Wert die Reihenfolge
 * der Taps über mehrere Läufe hinweg abbildet.
 */
export function letzterAnschlag(laeufe: Lauf[], index: number): BahnRunde | null {
  let treffer: BahnRunde | null = null
  let juengster = Number.NEGATIVE_INFINITY
  for (const lauf of laeufe) {
    const bahn = lauf.bahnen[index]
    const anschlag = bahn?.anschlaege.at(-1)
    if (!bahn || !anschlag) continue
    // `>=` lässt bei identischem Zeitstempel die später iterierte Runde gewinnen.
    if (anschlag.erfasstAt >= juengster) {
      juengster = anschlag.erfasstAt
      treffer = { lauf, bahn }
    }
  }
  return treffer
}

/**
 * Die nächste freie Wiederholungsnummer eines Satzes: höchste vorhandene
 * Nummer + 1, ohne Läufe also 1.
 */
export function naechsteWiederholung(laeufe: Lauf[]): number {
  return laeufe.reduce((hoechste, lauf) => Math.max(hoechste, lauf.wiederholung ?? 0), 0) + 1
}

/**
 * Prüft einen Serienplan und liefert eine deutsche Meldung oder `null`.
 *
 * Die Grenzen spiegeln `types.ts` und die Backup-Prüfung: 2 bis 20
 * Wiederholungen, Takt bis 60 Minuten, Startversatz bis 120 s, mindestens eine
 * Bahn. Der Takt ist erlaubt, auch wenn er kürzer als der Versatz ist — das ist
 * nur ein Hinweis, siehe `warnungSeriePlan`.
 */
export function pruefeSeriePlan(plan: SatzPlan, bahnen: number): string | null {
  if (!Number.isInteger(plan.wiederholungen) || plan.wiederholungen < 2) {
    return 'Eine Serie braucht mindestens zwei Wiederholungen.'
  }
  if (plan.wiederholungen > 20) return 'Höchstens 20 Wiederholungen pro Serie.'
  if (!Number.isFinite(plan.taktSek) || plan.taktSek <= 0) {
    return 'Der Takt muss größer als 0 s sein.'
  }
  if (plan.taktSek > 3600) return 'Der Takt darf höchstens 60 Minuten betragen.'
  if (!Number.isFinite(plan.startversatzMs) || plan.startversatzMs < 0) {
    return 'Der Startversatz darf nicht negativ sein.'
  }
  if (plan.startversatzMs > 120_000) return 'Der Startversatz darf höchstens 120 s betragen.'
  if (bahnen < 1) return 'Eine Serie braucht mindestens eine Bahn.'
  return null
}

/**
 * Kein Fehler, aber ein Hinweis: Wenn der Takt kürzer ist als der Versatz bis
 * zur letzten Reihe, startet die nächste Runde, bevor alle Reihen gestartet
 * sind.
 *
 * Geprüft wird `taktSek * 1000 <= (reihen - 1) * startversatzMs`. Bei nur einer
 * Wiederholung gibt es keine nächste Runde und damit keinen Hinweis.
 */
export function warnungSeriePlan(plan: SatzPlan, reihen: number): string | null {
  if (plan.wiederholungen < 2) return null
  if (plan.taktSek * 1000 <= (Math.max(1, reihen) - 1) * plan.startversatzMs) {
    return 'Der Takt ist kürzer als der Startversatz der letzten Reihe. Die nächste Runde beginnt, bevor alle Reihen gestartet sind.'
  }
  return null
}
