/**
 * Wettkampf: Rahmen, Disziplin, Heat, Ergebnis und Platzierung.
 *
 * Ein `Wettkampf` bündelt Disziplinen. In der Datenhaltung ist eine Disziplin
 * ein `Satz` mit `wettkampfId`, ein Heat ein `Lauf` mit `modus: 'wettkampf'`
 * und `wiederholung` als Laufnummer (siehe GLOSSARY.md, ADR 0006).
 *
 * Der Modus ändert nur die Bedienung, nicht die Datenhaltung: Auch ein Heat
 * besteht aus Bahnen mit Anschlägen. Im Wettkampf genügt ein Tap pro Bahn für
 * das Ziel; Splits pro Länge gibt es bewusst nicht.
 *
 * Alle Funktionen sind rein. IDs und `erstelltAm` entstehen nur in den
 * Erzeugern; die Messzeit selbst kommt aus `lauf.ts`.
 */

import { finishMs, isFinished } from './lauf'
import { newId } from './id'
import { truncateToHundredths } from './format'
import {
  SCHWIMMARTEN,
  type Bahn,
  type Beckenlaenge,
  type Lauf,
  type Satz,
  type Schwimmart,
  type Wettkampf,
} from './types'

/** Eine Zeile einer Meldeliste: Name und Bahn innerhalb eines Laufs. */
export interface WettkampfStart {
  name: string
  bahn: number
  jahrgang?: number | null
}

/** Ein Lauf (Heat) innerhalb einer Disziplin. */
export interface WettkampfLaufPlan {
  nummer: number
  starts: WettkampfStart[]
}

/** Eine Disziplin eines Wettkampfs, z. B. 100 m Freistil. */
export interface WettkampfDisziplinPlan {
  bezeichnung: string
  streckeM: number
  schwimmart: Schwimmart
  laeufe: WettkampfLaufPlan[]
}

/** Alles, was zum Anlegen eines Wettkampfs aus einer Meldeliste nötig ist. */
export interface WettkampfPlan {
  name: string
  datum: string
  beckenlaengeM: Beckenlaenge
  disziplinen: WettkampfDisziplinPlan[]
}

/**
 * Erzeugt einen Wettkampf-Rahmen. Der Name wird getrimmt, Datum und
 * Beckenlänge werden unverändert übernommen. Eine inhaltliche Prüfung findet
 * hier nicht statt; die Oberfläche lässt z. B. keinen leeren Namen zu.
 */
export function createWettkampf(daten: {
  name: string
  datum: string
  beckenlaengeM: Beckenlaenge
}): Wettkampf {
  return {
    id: newId(),
    name: daten.name.trim(),
    datum: daten.datum,
    beckenlaengeM: daten.beckenlaengeM,
    erstelltAm: Date.now(),
  }
}

/**
 * Baut die Anzeige-Bezeichnung einer Disziplin aus Strecke und Schwimmart,
 * z. B. „100 m Freistil“. Eine unbekannte Schwimmart fällt auf Freistil
 * zurück, damit die Anzeige nie leer bleibt.
 */
export function disziplinBezeichnung(streckeM: number, schwimmart: Schwimmart): string {
  const art = SCHWIMMARTEN.find((eintrag) => eintrag.wert === schwimmart)?.label ?? 'Freistil'
  return `${streckeM} m ${art}`
}

/**
 * Ein Wettkampf-Satz ist eine Disziplin. Der Plan bleibt leer (keine Serie);
 * `wettkampfId` ordnet den Satz dem Wettkampf zu.
 *
 * Eine leere `bezeichnung` wird aus Strecke und Schwimmart erzeugt. Die
 * Konfiguration übernimmt die Beckenlänge des Wettkampfs, damit alle Heats
 * derselben Disziplin vergleichbar bleiben.
 */
export function createWettkampfSatz(
  wettkampf: Wettkampf,
  disziplin: WettkampfDisziplinPlan,
  erstelltAm: number = Date.now(),
): Satz {
  return {
    id: newId(),
    datum: wettkampf.datum,
    bezeichnung: disziplin.bezeichnung || disziplinBezeichnung(disziplin.streckeM, disziplin.schwimmart),
    konfiguration: {
      beckenlaengeM: wettkampf.beckenlaengeM,
      streckeM: disziplin.streckeM,
      schwimmart: disziplin.schwimmart,
    },
    plan: null,
    wettkampfId: wettkampf.id,
    erstelltAm,
  }
}

/**
 * Ein Lauf (Heat) mit bereits aufgelösten Schwimmer-IDs.
 *
 * `modus` ist fest `wettkampf` (ein Tap = Ziel), der Startversatz ist 0, weil
 * in einem Heat alle gemeinsam starten. `wiederholung` trägt die Laufnummer,
 * damit die Rundenlogik und der Verlauf den Heat einordnen können.
 *
 * `schwimmerFuer` löst einen Start in eine Schwimmer-ID auf; `null` ist
 * erlaubt, wenn der Name noch keinem Stammdatensatz zugeordnet ist. Die Bahnen
 * werden nach Bahnnummer sortiert, unabhängig von der Reihenfolge der
 * Meldeliste.
 */
export function createWettkampfLauf(
  satz: Satz,
  laufPlan: WettkampfLaufPlan,
  schwimmerFuer: (start: WettkampfStart) => string | null,
): Lauf {
  return {
    id: newId(),
    satzId: satz.id,
    konfiguration: { ...satz.konfiguration },
    startWallMs: null,
    startversatzMs: 0,
    wiederholung: laufPlan.nummer,
    modus: 'wettkampf',
    bahnen: [...laufPlan.starts]
      .sort((a, b) => a.bahn - b.bahn)
      .map((start) => ({
        id: newId(),
        nummer: start.bahn,
        schwimmerId: schwimmerFuer(start),
        startMs: null,
        anschlaege: [],
      })),
  }
}

/**
 * Eine Ergebniszeile einer Bahn im Wettkampf.
 *
 * `zeitMs` ist die Zielzeit oder `null`, solange die Bahn offen ist. `platz` und
 * `rueckstandMs` sind ebenfalls `null`, bis eine Zeit vorliegt. `manuell` weist
 * aus, dass die Zielzeit von Hand eingetragen oder korrigiert wurde.
 */
export interface WettkampfErgebnisZeile {
  bahn: Bahn
  zeitMs: number | null
  /** Platz unter den gewerteten Bahnen; null, solange die Bahn offen ist. */
  platz: number | null
  /** Abstand zur Siegerzeit; null ohne Zeit. */
  rueckstandMs: number | null
  manuell: boolean
}

/**
 * Ergebnis eines Laufs. Gewertete Bahnen stehen nach Zeit vorn, offene danach
 * in Bahnreihenfolge. Zeitgleiche Zeiten teilen sich den Platz (1, 1, 3), so
 * wie es im Schwimmen üblich ist. Verglichen wird auf Hundertstel, weil nur
 * diese angezeigt werden.
 *
 * Der Rückstand bezieht sich dagegen auf die schnellste rohe Zeit: Zwei
 * angezeigte Hundertstel-Gleichstände können sich roh unterscheiden, und ein
 * negativer Rückstand auf Platz 1 wäre falsch. Die Reihenfolge der
 * zurückgegebenen Zeilen ist die Anzeigereihenfolge; die Eingabe wird nicht
 * verändert, weil die Sortierung auf neuen Arrays arbeitet.
 */
export function wettkampfErgebnis(lauf: Lauf): WettkampfErgebnisZeile[] {
  const zeilen = lauf.bahnen.map((bahn) => {
    const zeitMs = finishMs(bahn)
    return {
      bahn,
      zeitMs,
      platz: null as number | null,
      rueckstandMs: null as number | null,
      manuell: bahn.anschlaege.some((anschlag) => anschlag.istFinish && anschlag.manuell),
    }
  })

  const gewertet = zeilen
    .filter((zeile) => zeile.zeitMs !== null)
    .sort(
      // Bei gleicher Hundertstel-Zeit entscheidet die kleinere Bahnnummer, damit
      // die Reihenfolge stabil und für den Trainer nachvollziehbar bleibt.
      (a, b) =>
        truncateToHundredths(a.zeitMs ?? 0) - truncateToHundredths(b.zeitMs ?? 0) ||
        a.bahn.nummer - b.bahn.nummer,
    )
  const offen = zeilen
    .filter((zeile) => zeile.zeitMs === null)
    .sort((a, b) => a.bahn.nummer - b.bahn.nummer)

  // Für den Rückstand zählt die schnellste rohe Zeit, nicht die erste Zeile
  // nach Hundertstel-Sortierung. Sonst könnte bei einem angezeigten Gleichstand
  // ein negativer Rückstand entstehen.
  const siegerzeit = gewertet.reduce<number | null>(
    (minimum, zeile) =>
      zeile.zeitMs === null
        ? minimum
        : minimum === null
          ? zeile.zeitMs
          : Math.min(minimum, zeile.zeitMs),
    null,
  )
  // Platzvergabe mit Gleichstand: Wechselt die angezeigte Hundertstel-Zeit,
  // bekommt die Zeile ihren Listenplatz (1, 2, 3 …); bei Gleichstand bleibt der
  // zuletzt vergebene Platz stehen (1, 1, 3).
  let letzteZeit: number | null = null
  let letzterPlatz = 0
  gewertet.forEach((zeile, index) => {
    const zeit = truncateToHundredths(zeile.zeitMs ?? 0)
    if (letzteZeit === null || zeit !== letzteZeit) {
      letzterPlatz = index + 1
      letzteZeit = zeit
    }
    zeile.platz = letzterPlatz
    zeile.rueckstandMs = siegerzeit === null ? null : (zeile.zeitMs ?? 0) - siegerzeit
  })

  return [...gewertet, ...offen]
}

/**
 * Anzahl gewerteter Bahnen und Bahnen insgesamt über einen oder mehrere Läufe.
 * Gedacht für die Kopfzeilen von Wettkampf, Disziplin und Lauf; gezählt wird
 * pro Bahn, nicht pro Lauf.
 */
export function wettkampfFortschritt(laeufe: Lauf[]): { fertig: number; gesamt: number } {
  let fertig = 0
  let gesamt = 0
  for (const lauf of laeufe) {
    gesamt += lauf.bahnen.length
    fertig += lauf.bahnen.filter(isFinished).length
  }
  return { fertig, gesamt }
}

/**
 * True, wenn der Satz eine Disziplin eines Wettkampfs ist. Geprüft wird nur
 * `wettkampfId`, weil ein freier Satz und eine Serie dort `null` tragen.
 */
export function istWettkampfSatz(satz: Satz | null | undefined): boolean {
  return typeof satz?.wettkampfId === 'string' && satz.wettkampfId.length > 0
}
