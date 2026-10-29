/**
 * Memoisierte Auswertung je Satz (#68).
 *
 * Vorher lief `analyseRunden` in der Satzliste für jeden Satz über alle Läufe
 * (S × L) und in Matrix und Drill-down bei jedem Render erneut, obwohl sich oft
 * nur lokaler Zustand änderte — etwa der gewählte Satz oder die Person. Eine
 * Matrix mit 20 Runden × 10 Bahnen hat 200 Zellen; bei 19 Sätzen und 200 Läufen
 * sind allein die Filtervergleiche der Liste 3 800 pro Render.
 *
 * Deshalb drei gezielte Memos statt eines allgemeinen Caches:
 * - `laeufeNachSatz` gruppiert den Bestand in einem Durchlauf (O(L)) und hält
 *   das Ergebnis am Identitätsobjekt des Läufe-Arrays. Ein neuer Render mit
 *   unveränderten Daten trifft denselben Eintrag.
 * - Die abgeleiteten Werte liegen in einer `WeakMap` je Satz. Gültig bleibt ein
 *   Eintrag nur, solange die beteiligten `Lauf`-Objekte identisch sind. Der
 *   Provider ersetzt bei jeder Änderung genau den geänderten Lauf
 *   (`map(... ? neu : alt)`) und mutiert nie in place; damit kann kein
 *   veraltetes Ergebnis stehen bleiben. Wird der Satz ersetzt oder gelöscht,
 *   fällt der Eintrag mit dem WeakMap-Schlüssel weg.
 * - Es gibt höchstens einen Eintrag je Satz und Auswertung, keine globale
 *   Schlüsseltabelle und keine Aufbewahrung über den Satz hinaus.
 *
 * Der Test `analyseMemo.test.ts` belegt beides: unveränderte Läufe liefern
 * dasselbe Ergebnisobjekt, ein geänderter Lauf ein neues. Die Domänenfunktionen
 * bleiben rein und wissen nichts von dieser Schicht.
 */
import {
  abweichungZurVorrunde,
  analyseMatrix,
  laengenMatrix,
  letzterGleicherSatz,
  mittlereAbweichungen,
  sortiereRunden,
  type AnalyseMatrix,
  type LaengenMatrix,
  type RundenAbweichung,
} from '../domain/analyse'
import { isComplete, isFinished } from '../domain/lauf'
import type { Lauf, Satz } from '../domain/types'

/** Kennzahlen der Satzliste; entspricht den bisherigen Zeilenwerten. */
export interface SatzKennzahlen {
  runden: Lauf[]
  /** Nur Runden mit einer Vorrunde; gleiche Filterung wie zuvor in der Liste. */
  abweichungen: RundenAbweichung[]
  unvollstaendig: boolean
  manuell: boolean
}

/** Alles, was die Matrix eines geöffneten Satzes braucht. */
export interface SatzMatrixAuswertung {
  runden: Lauf[]
  anzahlRunden: number
  referenz: Satz | null
  referenzRunden: Lauf[]
  matrix: AnalyseMatrix
  /** Höchste gestartete, noch nicht vollständige Runde oder null. */
  laufendeRunde: number | null
  unvollstaendig: boolean
}

/** Längenzeiten einer Person über alle Runden. */
export interface PersonAuswertung {
  runden: Lauf[]
  matrix: LaengenMatrix
  live: number | null
}

interface KennzahlenEintrag {
  quellen: Lauf[]
  wert: SatzKennzahlen
}

interface MatrixEintrag {
  quellen: Lauf[]
  referenz: Satz | null
  referenzQuellen: Lauf[]
  wert: SatzMatrixAuswertung
}

interface PersonEintrag {
  quellen: Lauf[]
  wert: PersonAuswertung
}

interface ReferenzEintrag {
  satze: Satz[]
  laeufe: Lauf[]
  referenz: Satz | null
}

/** Läufe je Satz-ID; ein Eintrag pro Identität des Läufe-Arrays. */
const gruppenCache = new WeakMap<Lauf[], Map<string, Lauf[]>>()

/** Sortierte Runden je Satz; ein Eintrag pro Gruppen-Array. */
const sortiertCache = new WeakMap<Satz, { quelle: Lauf[]; runden: Lauf[] }>()

const kennzahlenCache = new WeakMap<Satz, KennzahlenEintrag>()
const matrixCache = new WeakMap<Satz, MatrixEintrag>()
const referenzCache = new WeakMap<Satz, ReferenzEintrag>()
const personCache = new WeakMap<Satz, Map<number, PersonEintrag>>()

/** Vergleicht Läufe über ihre Identität; der Provider ersetzt geänderte Objekte. */
function gleicheLaeufe(a: readonly Lauf[], b: readonly Lauf[]): boolean {
  return a.length === b.length && a.every((lauf, index) => lauf === b[index])
}

/**
 * Gruppiert alle Läufe nach Satz-ID in einem Durchlauf. Das Ergebnis hängt an
 * der Identität des Eingabe-Arrays; solange der Provider nichts ändert, wird
 * nicht erneut gruppiert.
 */
export function laeufeNachSatz(laeufe: Lauf[]): Map<string, Lauf[]> {
  const vorhanden = gruppenCache.get(laeufe)
  if (vorhanden) return vorhanden

  const gruppen = new Map<string, Lauf[]>()
  for (const lauf of laeufe) {
    if (!lauf.satzId) continue
    const liste = gruppen.get(lauf.satzId)
    if (liste) liste.push(lauf)
    else gruppen.set(lauf.satzId, [lauf])
  }
  gruppenCache.set(laeufe, gruppen)
  return gruppen
}

/** Runden eines Satzes in Anzeigereihenfolge, je Satz einmal sortiert. */
function rundenFuerSatz(satz: Satz, laeufe: Lauf[]): Lauf[] {
  const quelle = laeufeNachSatz(laeufe).get(satz.id) ?? []
  const eintrag = sortiertCache.get(satz)
  if (eintrag && eintrag.quelle === quelle) return eintrag.runden

  const runden = sortiereRunden(quelle)
  sortiertCache.set(satz, { quelle, runden })
  return runden
}

/**
 * Kennzahlen der Satzliste für einen Satz. Wiederholt die Berechnung nur, wenn
 * sich mindestens ein Lauf des Satzes geändert hat.
 */
export function kennzahlenFuerSatz(satz: Satz, laeufe: Lauf[]): SatzKennzahlen {
  const runden = rundenFuerSatz(satz, laeufe)
  const eintrag = kennzahlenCache.get(satz)
  if (eintrag && gleicheLaeufe(eintrag.quellen, runden)) return eintrag.wert

  const wert: SatzKennzahlen = {
    runden,
    abweichungen: mittlereAbweichungen(runden).filter(
      (eintrag) => eintrag.mittelMs !== null,
    ),
    unvollstaendig: runden.some((lauf) => !isComplete(lauf)),
    manuell: runden.some((lauf) =>
      lauf.bahnen.some((bahn) =>
        bahn.anschlaege.some((anschlag) => anschlag.manuell === true),
      ),
    ),
  }
  kennzahlenCache.set(satz, { quellen: runden, wert })
  return wert
}

/** Der letzte gleiche Satz; hängt an den Identitäten von Sätzen und Läufen. */
function referenzFuerSatz(satz: Satz, satze: Satz[], laeufe: Lauf[]): Satz | null {
  const eintrag = referenzCache.get(satz)
  if (eintrag && eintrag.satze === satze && eintrag.laeufe === laeufe) {
    return eintrag.referenz
  }

  const referenz = letzterGleicherSatz(satz, satze, laeufe)
  referenzCache.set(satz, { satze, laeufe, referenz })
  return referenz
}

/**
 * Matrix Person × Runde samt Referenz „zuletzt“. Der Eintrag wird nur
 * ungültig, wenn sich die Runden des Satzes oder die seines Referenzsatzes
 * ändern; ein Wechsel der geöffneten Person lässt ihn unberührt.
 */
export function matrixFuerSatz(
  satz: Satz,
  satze: Satz[],
  laeufe: Lauf[],
): SatzMatrixAuswertung {
  const runden = rundenFuerSatz(satz, laeufe)
  const referenz = referenzFuerSatz(satz, satze, laeufe)
  const referenzRunden = referenz ? rundenFuerSatz(referenz, laeufe) : []

  const eintrag = matrixCache.get(satz)
  if (
    eintrag &&
    gleicheLaeufe(eintrag.quellen, runden) &&
    eintrag.referenz === referenz &&
    gleicheLaeufe(eintrag.referenzQuellen, referenzRunden)
  ) {
    return eintrag.wert
  }

  const matrix = analyseMatrix(runden, referenzRunden)
  const laufendeRunde =
    [...runden]
      .reverse()
      .find((lauf) => lauf.bahnen.some((bahn) => bahn.startMs !== null && !isFinished(bahn)))
      ?.wiederholung ?? null

  const wert: SatzMatrixAuswertung = {
    runden,
    anzahlRunden: satz.plan?.wiederholungen ?? runden.length,
    referenz,
    referenzRunden,
    matrix,
    laufendeRunde,
    unvollstaendig: runden.some((lauf) => !isComplete(lauf)),
  }
  matrixCache.set(satz, { quellen: runden, referenz, referenzQuellen: referenzRunden, wert })
  return wert
}

/**
 * Längenzeiten einer Person für den Drill-down. Der Eintrag hängt am Satz und
 * an der Bahnposition; er wird bei geänderten Läufen neu gebaut.
 */
export function personFuerSatz(satz: Satz, index: number, laeufe: Lauf[]): PersonAuswertung {
  const runden = rundenFuerSatz(satz, laeufe)
  let proSatz = personCache.get(satz)
  if (!proSatz) {
    proSatz = new Map()
    personCache.set(satz, proSatz)
  }

  const eintrag = proSatz.get(index)
  if (eintrag && gleicheLaeufe(eintrag.quellen, runden)) return eintrag.wert

  const letzteRunde = runden.at(-1)
  const wert: PersonAuswertung = {
    runden,
    matrix: laengenMatrix(runden, index),
    live:
      letzteRunde?.wiederholung != null
        ? abweichungZurVorrunde(runden, index, letzteRunde.wiederholung)
        : null,
  }
  proSatz.set(index, { quellen: runden, wert })
  return wert
}
