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
import { einheitVon, pacePro100Einheit } from './einheit'
import { istWettkampfSatz } from './wettkampf'
import type { Bahn, Einheit, Lauf, LaufKonfiguration, Satz } from './types'

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
    // Meter- und Yard-Becken erzeugen getrennte Bestzeiten, auch wenn die
    // kanonische Länge zufällig gleich wäre (ADR 0009).
    einheitVon(konfiguration),
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
export function pacePro100(ms: number, streckeM: number, einheit: Einheit = 'm'): number {
  return pacePro100Einheit(ms, streckeM, einheit)
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

// ---------------------------------------------------------------------------
// Analyse: Zwischenzeiten, Rundenvergleich und Satz-Referenz
// ---------------------------------------------------------------------------

/**
 * Die Längenzeiten einer Bahn, abgeleitet aus den kumulierten Splits.
 *
 * `zeitMs` ist die Zeit einer einzelnen Länge (Split minus Split der Länge
 * davor); der erste Anschlag ist bereits die Längenzeit. Die kumulierte Zeit
 * bleibt daneben erhalten, weil das Lauf-Detail und der CSV-Export sie zeigen.
 * Negative Werte nach einer ungewöhnlichen Korrektur werden bei 0 gekappt.
 */
export interface LaengenZeit {
  laengeNr: number
  kumuliertMs: number
  zeitMs: number
  manuell: boolean
}

export function laengenZeiten(bahn: Bahn): LaengenZeit[] {
  let vorher = 0
  return bahn.anschlaege.map((anschlag) => {
    const zeitMs = Math.max(0, anschlag.splitMs - vorher)
    vorher = anschlag.splitMs
    return {
      laengeNr: anschlag.laengeNr,
      kumuliertMs: anschlag.splitMs,
      zeitMs,
      manuell: anschlag.manuell === true,
    }
  })
}

/** Eine Zelle der Satz-Matrix: eine Person in einer Runde. */
export interface AnalyseZelle {
  lauf: Lauf
  bahn: Bahn
  /** Zielzeit oder null, solange die Bahn offen ist. */
  ms: number | null
  /** Abweichung zur eigenen Zeit in der vorherigen Runde; positiv = langsamer. */
  abweichungMs: number | null
  /** Schnellste Zielzeit dieser Runde (fett, nicht eingefärbt). */
  istSchnellste: boolean
  /** Gestartet oder mit Splits, aber ohne Finish. */
  unvollstaendig: boolean
  /** Mindestens ein Anschlag wurde von Hand korrigiert. */
  manuell: boolean
  hatSplits: boolean
}

/** Eine Zeile der Satz-Matrix: eine Person über alle Runden. */
export interface AnalyseZeile {
  /** Position der Bahn im Rundenarray; stabil über alle Runden. */
  index: number
  nummer: number
  schwimmerId: string | null
  /** Zellen je Runde; null, wenn die Runde diese Bahn nicht enthält. */
  zellen: (AnalyseZelle | null)[]
  /** Zielzeit derselben Person im letzten gleichen Satz (Spalte „zuletzt“). */
  letzteMs: number | null
}

export interface AnalyseMatrix {
  runden: Lauf[]
  zeilen: AnalyseZeile[]
  /** Schnellste Zielzeit je Runde; Grundlage der Fett-Markierung. */
  schnellsteJeRunde: (number | null)[]
}

/**
 * Sortiert die Läufe eines Satzes in Anzeigereihenfolge: bei einer Serie nach
 * Wiederholungsnummer, bei frei gewachsenen Sätzen nach Startzeit. So stehen
 * die Wiederholungen in der Matrix in der Reihenfolge, in der sie geschwommen
 * wurden.
 *
 * Die Funktion erwartet bereits die Läufe eines Satzes. Aufrufer, die den
 * Bestand ohnehin je Satz gruppieren, sparen damit das wiederholte Filtern
 * über alle Läufe.
 */
export function sortiereRunden(laeufe: Lauf[]): Lauf[] {
  const hatNummern = laeufe.some((lauf) => lauf.wiederholung !== null)
  return [...laeufe].sort((a, b) =>
    hatNummern
      ? (a.wiederholung ?? 0) - (b.wiederholung ?? 0)
      : (a.startWallMs ?? 0) - (b.startWallMs ?? 0) || a.id.localeCompare(b.id),
  )
}

/** Die Runden eines Satzes in Anzeigereihenfolge; filtert aus allen Läufen. */
export function analyseRunden(satz: Satz, laeufe: Lauf[]): Lauf[] {
  return sortiereRunden(laeufe.filter((lauf) => lauf.satzId === satz.id))
}

/** Wahr, wenn ein einzelner Lauf auswertbare Zwischenzeiten beisteuert. */
function istAnalyseLauf(lauf: Lauf): boolean {
  return (
    lauf.modus !== 'wettkampf' && lauf.bahnen.some((bahn) => bahn.anschlaege.length > 0)
  )
}

/**
 * Wie `istAnalyseSatz`, aber für die bereits gruppierten Läufe eines Satzes.
 * Eine Liste kann so den Bestand einmal nach Satz gruppieren, statt für jeden
 * Satz alle Läufe zu filtern.
 */
export function istAnalyseSatzAusRunden(satz: Satz, runden: Lauf[]): boolean {
  if (istWettkampfSatz(satz)) return false
  return runden.some(istAnalyseLauf)
}

/**
 * True, wenn ein Satz in der Analyse erscheint: mindestens ein Split, kein
 * Wettkampf. Wettkampf-Heats haben keine Zwischenzeiten (ADR 0006) und lassen
 * sich deshalb nicht vergleichen.
 */
export function istAnalyseSatz(satz: Satz, laeufe: Lauf[]): boolean {
  if (istWettkampfSatz(satz)) return false
  return laeufe.some((lauf) => lauf.satzId === satz.id && istAnalyseLauf(lauf))
}

/** Zwei Sätze sind nur vergleichbar, wenn Strecke, Schwimmart und Becken gleich sind. */
function gleicheBasis(a: Satz, b: Satz): boolean {
  return (
    a.konfiguration.streckeM === b.konfiguration.streckeM &&
    a.konfiguration.schwimmart === b.konfiguration.schwimmart &&
    a.konfiguration.beckenlaengeM === b.konfiguration.beckenlaengeM &&
    einheitVon(a.konfiguration) === einheitVon(b.konfiguration)
  )
}

/**
 * Rundenzahl eines Satzes: der geplante Umfang einer Serie, sonst die Anzahl
 * der vorhandenen Läufe. Die Zahl ist das Ausschlusskriterium für die Referenz,
 * weil Sätze mit unterschiedlich vielen Runden nicht vergleichbar sind.
 */
export function rundenzahl(satz: Satz, laeufe: Lauf[]): number {
  const vorhanden = laeufe.filter((lauf) => lauf.satzId === satz.id).length
  return satz.plan?.wiederholungen ?? vorhanden
}

/**
 * Der letzte Satz vor `aktuell` mit gleicher Strecke, Schwimmart, Beckenlänge
 * und Rundenzahl, der auswertbare Splits hat. `null`, wenn es keinen gibt.
 *
 * Der Takt zählt bewusst nicht zum Vergleich: Ein anderer Takt macht die Zeiten
 * nicht unvergleichbar, wird aber in der Referenzzeile genannt. Offene Strecken
 * sind ausgeschlossen, weil dort keine feste Strecke definiert ist.
 */
export function letzterGleicherSatz(
  aktuell: Satz,
  satze: Satz[],
  laeufe: Lauf[],
): Satz | null {
  if (aktuell.konfiguration.streckeM === null) return null
  const zielRunden = rundenzahl(aktuell, laeufe)
  const kandidaten = satze.filter((satz) => {
    if (satz.id === aktuell.id) return false
    if (satz.konfiguration.streckeM === null) return false
    if (!gleicheBasis(satz, aktuell)) return false
    if (rundenzahl(satz, laeufe) !== zielRunden) return false
    if (!istAnalyseSatz(satz, laeufe)) return false
    // Nur Sätze, die vor dem aktuellen liegen; bei gleichem Tag entscheidet
    // die Anlagezeit, damit ein später angelegter Satz nicht als Referenz dient.
    return (
      satz.datum < aktuell.datum ||
      (satz.datum === aktuell.datum && satz.erstelltAm < aktuell.erstelltAm)
    )
  })
  return (
    kandidaten.sort(
      (a, b) => b.datum.localeCompare(a.datum) || b.erstelltAm - a.erstelltAm,
    )[0] ?? null
  )
}

/** Schlüssel einer Person innerhalb eines Satzes: ID, sonst Bahnnummer. */
function personenSchluessel(bahn: Bahn): string {
  return bahn.schwimmerId ?? `bahn:${bahn.nummer}`
}

/**
 * Baut die Matrix Person × Runde. Zeilen sind nach Bahnnummer der ersten Runde
 * sortiert, Spalten in Rundenreihenfolge. Die Abweichung bezieht sich immer
 * auf die unmittelbar vorherige Runde derselben Person.
 *
 * `referenzRunden` sind die Runden des letzten gleichen Satzes. Fehlt eine
 * Person dort, bleibt ihre Spalte „zuletzt“ leer; ein Takt spielt keine Rolle.
 */
export function analyseMatrix(runden: Lauf[], referenzRunden: Lauf[] = []): AnalyseMatrix {
  // Letzte Zielzeit je Person in der Referenz; spätere Runden überschreiben
  // frühere, weil der Satz als Ganzes verglichen wird.
  const referenz = new Map<string, number>()
  for (const lauf of referenzRunden) {
    for (const bahn of lauf.bahnen) {
      const ms = finishMs(bahn)
      if (ms !== null) referenz.set(personenSchluessel(bahn), ms)
    }
  }

  const basis = runden[0]
  const positionen = (basis?.bahnen ?? [])
    .map((bahn, index) => ({ bahn, index }))
    .sort((a, b) => a.bahn.nummer - b.bahn.nummer)

  // Schnellste Zeit je Runde vorab bestimmen; nur echte Zielzeiten zählen.
  const schnellsteJeRunde = runden.map((lauf) => {
    const zeiten = lauf.bahnen
      .map((bahn) => finishMs(bahn))
      .filter((ms): ms is number => ms !== null)
    return zeiten.length > 0 ? Math.min(...zeiten) : null
  })

  const zeilen: AnalyseZeile[] = positionen.map(({ bahn: basisBahn, index }) => {
    const zellen = runden.map((lauf, rundeIndex) => {
      const bahn = lauf.bahnen[index]
      if (!bahn) return null
      const ms = finishMs(bahn)
      const vorher = rundeIndex > 0 ? runden[rundeIndex - 1]?.bahnen[index] : undefined
      const vorherMs = vorher ? finishMs(vorher) : null
      const schnellste = schnellsteJeRunde[rundeIndex]
      return {
        lauf,
        bahn,
        ms,
        abweichungMs: ms !== null && vorherMs !== null ? ms - vorherMs : null,
        istSchnellste: ms !== null && schnellste !== null && ms === schnellste,
        unvollstaendig: ms === null && (bahn.startMs !== null || bahn.anschlaege.length > 0),
        manuell: bahn.anschlaege.some((anschlag) => anschlag.manuell === true),
        hatSplits: bahn.anschlaege.length > 0,
      }
    })

    // Die Person kann in späteren Runden umbelegt worden sein; für Name und
    // Referenz zählt die jüngste bekannte Zuordnung.
    const schwimmerId =
      [...zellen].reverse().find((zelle) => zelle?.bahn.schwimmerId)?.bahn.schwimmerId ??
      basisBahn.schwimmerId
    const letzteMs = referenz.get(schwimmerId ?? `bahn:${basisBahn.nummer}`) ?? null

    return { index, nummer: basisBahn.nummer, schwimmerId, zellen, letzteMs }
  })

  return { runden, zeilen, schnellsteJeRunde }
}

/** Eine Zelle des Längen-Drill-downs. */
export interface LaengenZelle {
  zeitMs: number
  kumuliertMs: number
  /** Abweichung zur selben Länge in der vorherigen Runde; positiv = langsamer. */
  abweichungMs: number | null
  manuell: boolean
  istFinish: boolean
}

/** Eine Längen-Zeile über alle Runden. */
export interface LaengenZeile {
  laengeNr: number
  /** Strecke bis zu dieser Länge in Metern; null bei unbekannter Beckenlänge. */
  meter: number | null
  zellen: (LaengenZelle | null)[]
}

export interface LaengenMatrix {
  runden: Lauf[]
  zeilen: LaengenZeile[]
}

/**
 * Längenzeiten einer Person über alle Runden. Die Anzahl der Zeilen ist die
 * längste Bahn des Satzes; spätere Längen bleiben in früheren Runden leer,
 * wenn dort weniger geschwommen wurde.
 *
 * Die Abweichung bezieht sich auf dieselbe Länge der vorherigen Runde, nicht
 * auf die kumulierte Zielzeit.
 */
export function laengenMatrix(runden: Lauf[], index: number): LaengenMatrix {
  const bahnen = runden.map((lauf) => lauf.bahnen[index])
  const anzahl = Math.max(0, ...bahnen.map((bahn) => bahn?.anschlaege.length ?? 0))
  const beckenlaenge = runden[0]?.konfiguration.beckenlaengeM ?? null
  const proRunde = bahnen.map((bahn) => (bahn ? laengenZeiten(bahn) : []))

  const zeilen: LaengenZeile[] = Array.from({ length: anzahl }, (_, laengenIndex) => {
    const laengeNr = laengenIndex + 1
    const zellen = proRunde.map((laengen, rundeIndex) => {
      const aktuell = laengen.find((eintrag) => eintrag.laengeNr === laengeNr)
      if (!aktuell) return null
      const vorher =
        rundeIndex > 0
          ? proRunde[rundeIndex - 1]?.find((eintrag) => eintrag.laengeNr === laengeNr)
          : undefined
      return {
        zeitMs: aktuell.zeitMs,
        kumuliertMs: aktuell.kumuliertMs,
        abweichungMs: vorher ? aktuell.zeitMs - vorher.zeitMs : null,
        manuell: aktuell.manuell,
        istFinish: bahnen[rundeIndex]?.anschlaege[laengenIndex]?.istFinish ?? false,
      }
    })
    return {
      laengeNr,
      meter: beckenlaenge === null ? null : laengeNr * beckenlaenge,
      zellen,
    }
  })

  return { runden, zeilen }
}

/**
 * Abweichung der angegebenen Runde zur Vorrunde für eine Bahnposition.
 * `null`, wenn eine der beiden Runden fehlt oder nicht im Ziel ist.
 *
 * Gedacht für die Live-Anzeige in der Serien-Ansicht; die Matrix berechnet
 * dieselbe Differenz spaltenweise.
 */
export function abweichungZurVorrunde(
  runden: Lauf[],
  index: number,
  runde: number,
): number | null {
  const position = runden.findIndex((lauf) => lauf.wiederholung === runde)
  if (position <= 0) return null
  const aktuell = runden[position]?.bahnen[index]
  const vorher = runden[position - 1]?.bahnen[index]
  const aktuellMs = aktuell ? finishMs(aktuell) : null
  const vorherMs = vorher ? finishMs(vorher) : null
  return aktuellMs !== null && vorherMs !== null ? aktuellMs - vorherMs : null
}

/** Durchschnittliche Abweichung je Runde über alle Personen; für die Satzliste. */
export interface RundenAbweichung {
  runde: number
  /** Gemittelte Abweichung in ms oder null, wenn keine Vorrunde im Ziel ist. */
  mittelMs: number | null
  /** Anzahl der Personen, die in beide Runden eine Zeit haben. */
  anzahl: number
}

export function mittlereAbweichungen(runden: Lauf[]): RundenAbweichung[] {
  return runden.map((lauf, rundeIndex) => {
    const anzahl = Math.min(...runden.map((eintrag) => eintrag.bahnen.length), lauf.bahnen.length)
    if (rundeIndex === 0 || anzahl === 0) {
      return { runde: lauf.wiederholung ?? rundeIndex + 1, mittelMs: null, anzahl: 0 }
    }
    const werte: number[] = []
    for (let index = 0; index < anzahl; index += 1) {
      const aktuell = finishMs(lauf.bahnen[index]!)
      const vorher = finishMs(runden[rundeIndex - 1]!.bahnen[index]!)
      if (aktuell !== null && vorher !== null) werte.push(aktuell - vorher)
    }
    return {
      runde: lauf.wiederholung ?? rundeIndex + 1,
      mittelMs:
        werte.length > 0 ? Math.round(werte.reduce((summe, wert) => summe + wert, 0) / werte.length) : null,
      anzahl: werte.length,
    }
  })
}
