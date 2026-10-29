/**
 * CSV-Export für Trainingszeiten und Wettkampfergebnisse.
 *
 * Beide Exporte sind Langformat-Tabellen (eine Zeile pro Anschlag bzw. pro
 * Start) mit Semikolon als Trenner, CRLF als Zeilenende und UTF-8-BOM, damit
 * deutsches Excel die Datei ohne Import-Dialog korrekt öffnet. Texte werden
 * nach RFC 4180 maskiert; Zellen, die Excel als Formel interpretieren würde,
 * bekommen ein führendes Apostroph.
 *
 * Datenfluss: Die UI übergibt die bereits geladenen Domänenobjekte, `csv.ts`
 * löst nur Referenzen (Satz, Schwimmer) in Bezeichnungen auf und formatiert
 * Zeiten über `domain/format`. Die Dateiausgabe übernimmt `export/datei.ts`.
 *
 * Invarianten: Spaltenreihenfolge und Kopfzeilen sind stabil, damit
 * Auswertungen nicht brechen; fehlende Werte bleiben leere Zellen, Zahlen
 * werden unverändert (nicht lokalisiert) geschrieben.
 */
import { formatTime, lokalesDatum } from '../domain/format'
import { wettkampfErgebnis } from '../domain/wettkampf'
import type { Lauf, Satz, Schwimmer, Wettkampf } from '../domain/types'

// Semikolon ist der Standard-Trenner in deutschem Excel; dadurch sind Kommas
// in Zeiten und Dezimalzahlen kein Sonderfall.
const TRENNER = ';'

/**
 * Excel und LibreOffice führen eine Zelle, die mit `=`, `+`, `-` oder `@`
 * beginnt, als Formel aus. Namen und Bezeichnungen kommen vom Nutzer; ein
 * führendes Apostroph hält die Zelle Text, ohne den sichtbaren Inhalt zu
 * verändern.
 */
const FORMEL_START = /^[=+\-@\t\r]/

/**
 * Formatiert einen einzelnen CSV-Wert.
 *
 * Nur Text wird gegen Formelinterpretation geschützt; Zahlen bleiben Zahlen.
 * Enthält der Wert den Trenner, ein Anführungszeichen oder einen Zeilenumbruch,
 * wird er in Anführungszeichen gesetzt und innere Anführungszeichen werden
 * verdoppelt. Andernfalls bleibt die Zelle unmaskiert.
 */
function feld(wert: string | number): string {
  const roh = String(wert)
  const text = typeof wert === 'string' && FORMEL_START.test(roh) ? `'${roh}` : roh
  if (text.includes(TRENNER) || text.includes('"') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

// Stabile Spaltenreihenfolge des Trainings-Exports. Rein numerische Felder
// (split_ms) stehen neben den formatierten Zeiten, damit Auswertungen beides
// nutzen können, ohne selbst parsen zu müssen.
const KOPFZEILE = [
  'satz',
  'datum',
  'beckenlaenge_m',
  'strecke_m',
  'schwimmart',
  'reihe',
  'bahn',
  'schwimmer',
  'laenge_nr',
  'split_ms',
  'split_formatiert',
  'ist_finish',
  'manuell',
  'wiederholung',
  'wiederholungen',
  'takt_s',
  'startversatz_ms',
]

/**
 * Langformat: eine Zeile pro Anschlag. Semikolon und UTF-8-BOM, damit deutsches
 * Excel die Datei ohne Import-Dialog korrekt öffnet.
 *
 * Die Läufe werden nach `startWallMs` aufsteigend sortiert; Läufe ohne
 * Wanduhr-Anker (0) stehen dadurch am Anfang. Ein Lauf ohne Anschläge erzeugt
 * keine Datenzeile, nur die Kopfzeile bleibt.
 *
 * Auflösung der Referenzen: `satz` und `schwimmer` werden einmal in Maps
 * indexiert, damit die Zeilenerzeugung nicht quadratisch wird. Das Datum kommt
 * aus dem Start des Laufs (lokal, nicht UTC), ersatzweise aus dem Satzdatum.
 * Serienfelder (`wiederholung`, `wiederholungen`, `takt_s`) stammen aus Lauf
 * bzw. Satzplan und bleiben leer, wenn der Lauf keine Serie ist.
 *
 * Rückgabe: vollständiger CSV-Text inklusive BOM, CRLF-Zeilenenden und
 * abschließendem Zeilenumbruch.
 */
export function laeufeAlsCsv(laeufe: Lauf[], satze: Satz[], schwimmer: Schwimmer[]): string {
  const satzName = new Map(satze.map((s) => [s.id, s]))
  const schwimmerName = new Map(schwimmer.map((s) => [s.id, s.name]))

  // Kopie sortieren, damit die übergebene Liste unverändert bleibt. Läufe ohne
  // Wanduhr-Anker werden als 0 behandelt und stehen damit vorn.
  const zeilen = [...laeufe]
    .sort((a, b) => (a.startWallMs ?? 0) - (b.startWallMs ?? 0))
    .flatMap((lauf) => {
      const satz = lauf.satzId ? satzName.get(lauf.satzId) : undefined
      // Der Startzeitpunkt des Laufs ist genauer als das Tagesdatum des Satzes.
      const datum = lauf.startWallMs
        ? lokalesDatum(lauf.startWallMs)
        : (satz?.datum ?? '')
      // Ein Lauf liefert so viele Zeilen, wie er Anschläge hat. Die
      // Konfiguration wird pro Zeile wiederholt, damit jede Zeile für sich
      // auswertbar ist.
      return lauf.bahnen.flatMap((bahn) =>
        bahn.anschlaege.map((anschlag) =>
          [
            satz?.bezeichnung ?? '',
            datum,
            lauf.konfiguration.beckenlaengeM,
            lauf.konfiguration.streckeM ?? '',
            lauf.konfiguration.schwimmart,
            bahn.reihe ?? 1,
            bahn.nummer,
            bahn.schwimmerId ? (schwimmerName.get(bahn.schwimmerId) ?? '') : '',
            anschlag.laengeNr,
            anschlag.splitMs,
            formatTime(anschlag.splitMs),
            anschlag.istFinish ? 1 : 0,
            anschlag.manuell ? 1 : 0,
            lauf.wiederholung ?? '',
            satz?.plan?.wiederholungen ?? '',
            satz?.plan?.taktSek ?? '',
            lauf.startversatzMs ?? 0,
          ]
            .map(feld)
            .join(TRENNER),
        ),
      )
    })

  // BOM macht die UTF-8-Kodierung für Excel erkennbar; CRLF ist das von Excel
  // erwartete Zeilenende. Der abschließende Umbruch beendet die letzte Zeile.
  return `\uFEFF${[KOPFZEILE.join(TRENNER), ...zeilen].join('\r\n')}\r\n`
}

/**
 * Dateiname des Trainings-Exports mit lokalem Tagesdatum,
 * z. B. `beckenrand-2026-10-29.csv`. Bewusst ohne Uhrzeit; bei mehreren
 * Exporten am selben Tag nummeriert der Browser die Dateinamen durch.
 */
export function csvDateiname(): string {
  return `beckenrand-${lokalesDatum(Date.now())}.csv`
}

// Spalten des Wettkampf-Exports. `platz` und `status` machen die Wertung direkt
// lesbar; `zeit_ms` bleibt für Berechnungen daneben stehen.
const WETTKAMPF_KOPFZEILE = [
  'wettkampf',
  'datum',
  'disziplin',
  'strecke_m',
  'schwimmart',
  'lauf',
  'platz',
  'bahn',
  'schwimmer',
  'zeit_ms',
  'zeit_formatiert',
  'status',
  'manuell',
]

/**
 * Ergebnisliste eines Wettkampfs: eine Zeile pro Start, gewertete Bahnen nach
 * Platz, offene Bahnen am Ende. Semikolon und BOM wie beim Trainings-Export,
 * damit deutsches Excel die Datei direkt öffnet.
 *
 * Erwartet in `satze` die Disziplinen des Wettkampfs (die Funktion filtert
 * nicht nach `wettkampfId`) und in `laeufe` die zugehörigen Heats. Disziplinen
 * werden nach `erstelltAm` sortiert, Heats innerhalb einer Disziplin nach
 * `wiederholung`; die Zeilenreihenfolge innerhalb eines Heats kommt aus
 * `wettkampfErgebnis` (Platzierung, offene Bahnen zuletzt).
 *
 * Pro Zeile: Wettkampfname und -datum, Disziplin, Strecke, Schwimmart, Heat,
 * Platz (leer bei offener Bahn), Bahn, Schwimmername, Zeit in ms und
 * formatiert, Status `Ziel` oder `offen` sowie die Manuell-Markierung der
 * Zielzeit. Der Rückstand wird nicht exportiert, nur der Platz.
 */
export function wettkampfErgebnisseAlsCsv(
  wettkampf: Wettkampf,
  satze: Satz[],
  laeufe: Lauf[],
  schwimmer: Schwimmer[],
): string {
  const schwimmerName = new Map(schwimmer.map((eintrag) => [eintrag.id, eintrag.name]))
  // Reihenfolge der Disziplinen = Reihenfolge ihrer Anlage im Wettkampf.
  const zeilen = [...satze]
    .sort((a, b) => a.erstelltAm - b.erstelltAm)
    .flatMap((satz) => {
      // Nur Heats dieser Disziplin. Ältere Läufe ohne Wiederholungsnummer
      // bekommen den Sortierschlüssel 0 und stehen damit vorn; exportiert wird
      // für sie die Heat 1.
      const zugehoerige = laeufe
        .filter((lauf) => lauf.satzId === satz.id)
        .sort((a, b) => (a.wiederholung ?? 0) - (b.wiederholung ?? 0))
      return zugehoerige.flatMap((lauf) =>
        wettkampfErgebnis(lauf).map((zeile) =>
          [
            wettkampf.name,
            wettkampf.datum,
            satz.bezeichnung,
            satz.konfiguration.streckeM ?? '',
            satz.konfiguration.schwimmart,
            lauf.wiederholung ?? 1,
            zeile.platz ?? '',
            zeile.bahn.nummer,
            zeile.bahn.schwimmerId ? (schwimmerName.get(zeile.bahn.schwimmerId) ?? '') : '',
            // Offene Bahnen haben keine Zeit; die Zelle bleibt leer, damit
            // Excel sie nicht als 0 zählt.
            zeile.zeitMs ?? '',
            zeile.zeitMs === null ? '' : formatTime(zeile.zeitMs),
            zeile.zeitMs === null ? 'offen' : 'Ziel',
            zeile.manuell ? 1 : 0,
          ]
            .map(feld)
            .join(TRENNER),
        ),
      )
    })

  return `\uFEFF${[WETTKAMPF_KOPFZEILE.join(TRENNER), ...zeilen].join('\r\n')}\r\n`
}

/**
 * Dateiname der Wettkampf-Ergebnisse, z. B.
 * `beckenrand-wettkampf-2026-10-29.csv`. Das Wettkampfdatum statt des
 * Exportdatums, damit die Datei zum Wettkampftag passt.
 */
export function wettkampfCsvDateiname(wettkampf: Wettkampf): string {
  return `beckenrand-wettkampf-${wettkampf.datum}.csv`
}
