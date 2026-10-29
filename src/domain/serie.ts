import { finishMs, isComplete, isFinished } from './lauf'
import type { Bahn, Lauf, Satz, SatzPlan } from './types'

/** Ein Satz ist eine Serie, sobald er mehr als eine Wiederholung plant. */
export function istSerie(satz: Satz | null | undefined): boolean {
  return (satz?.plan?.wiederholungen ?? 1) > 1
}

/** Alle Wiederholungen eines Satzes, nach Wiederholungsnummer sortiert. */
export function runden(laeufe: Lauf[], satzId: string | null): Lauf[] {
  if (!satzId) return []
  return laeufe
    .filter((lauf) => lauf.satzId === satzId)
    .sort((a, b) => (a.wiederholung ?? 0) - (b.wiederholung ?? 0))
}

export interface BahnRunde {
  lauf: Lauf
  bahn: Bahn
}

export type ZeilenStatus = 'bereit' | 'geplant' | 'laeuft' | 'ueberfaellig' | 'fertig'

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
 */
export function bahnZeile(laeufe: Lauf[], index: number, now: number): BahnZeile {
  const offene: BahnRunde[] = []
  let naechste: BahnRunde | null = null
  let letzte: BahnRunde | null = null

  for (const lauf of laeufe) {
    const bahn = lauf.bahnen[index]
    if (!bahn) continue
    if (isFinished(bahn)) {
      letzte = { lauf, bahn }
      continue
    }
    if (bahn.startMs === null) continue
    if (now < bahn.startMs) {
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
  if (zeile.offen) return Math.max(0, now - (zeile.offen.bahn.startMs ?? now))
  if (zeile.naechste) return Math.max(0, (zeile.naechste.bahn.startMs ?? now) - now)
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
 * Die Runde, deren letzter Anschlag am jüngsten ist. Für „rückgängig“ zählt
 * die tatsächliche Bedienreihenfolge, nicht die Rundennummer.
 */
export function letzterAnschlag(laeufe: Lauf[], index: number): BahnRunde | null {
  let treffer: BahnRunde | null = null
  let juengster = Number.NEGATIVE_INFINITY
  for (const lauf of laeufe) {
    const bahn = lauf.bahnen[index]
    const anschlag = bahn?.anschlaege.at(-1)
    if (!bahn || !anschlag) continue
    if (anschlag.erfasstAt >= juengster) {
      juengster = anschlag.erfasstAt
      treffer = { lauf, bahn }
    }
  }
  return treffer
}

/** Die nächste freie Wiederholungsnummer eines Satzes. */
export function naechsteWiederholung(laeufe: Lauf[]): number {
  return laeufe.reduce((hoechste, lauf) => Math.max(hoechste, lauf.wiederholung ?? 0), 0) + 1
}

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
 * Kein Fehler, aber ein Hinweis: Wenn der Takt kürzer ist als der Versatz der
 * letzten Bahn, startet die nächste Runde, bevor alle gestartet sind.
 */
export function warnungSeriePlan(plan: SatzPlan, bahnen: number): string | null {
  if (plan.wiederholungen < 2) return null
  if (plan.taktSek * 1000 <= (bahnen - 1) * plan.startversatzMs) {
    return 'Der Takt ist kürzer als der Startversatz der letzten Bahn. Die nächste Runde beginnt, bevor alle gestartet sind.'
  }
  return null
}
