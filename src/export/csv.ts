/**
 * CSV-Export für Trainingszeiten.
 *
 * Der Export ist eine Langformat-Tabelle (eine Zeile pro Anschlag) mit
 * Semikolon als Trenner, CRLF als Zeilenende und UTF-8-BOM, damit deutsches
 * Excel die Datei ohne Import-Dialog korrekt öffnet. Texte werden nach RFC 4180
 * maskiert; Zellen, die Excel als Formel interpretieren würde, bekommen ein
 * führendes Apostroph.
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
import { einheitVon, streckeAnzeige } from '../domain/einheit'
import type { Lauf, Satz, Schwimmer } from '../domain/types'

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
  'einheit',
  'strecke_m',
  'strecke',
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
      const einheit = einheitVon(lauf.konfiguration)
      return lauf.bahnen.flatMap((bahn) =>
        bahn.anschlaege.map((anschlag) =>
          [
            satz?.bezeichnung ?? '',
            datum,
            lauf.konfiguration.beckenlaengeM,
            einheit,
            lauf.konfiguration.streckeM ?? '',
            // Anzeige-Strecke in der Einheit; `strecke_m` bleibt kanonisch.
            streckeAnzeige(lauf.konfiguration.streckeM, einheit) ?? '',
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
