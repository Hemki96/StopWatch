import { formatTime, lokalesDatum } from '../domain/format'
import type { Lauf, Satz, Schwimmer } from '../domain/types'

const TRENNER = ';'

function feld(wert: string | number): string {
  const text = String(wert)
  if (text.includes(TRENNER) || text.includes('"') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

const KOPFZEILE = [
  'satz',
  'datum',
  'beckenlaenge_m',
  'strecke_m',
  'schwimmart',
  'bahn',
  'schwimmer',
  'laenge_nr',
  'split_ms',
  'split_formatiert',
  'ist_finish',
  'manuell',
]

/**
 * Langformat: eine Zeile pro Anschlag. Semikolon und UTF-8-BOM, damit deutsches
 * Excel die Datei ohne Import-Dialog korrekt öffnet.
 */
export function laeufeAlsCsv(laeufe: Lauf[], satze: Satz[], schwimmer: Schwimmer[]): string {
  const satzName = new Map(satze.map((s) => [s.id, s]))
  const schwimmerName = new Map(schwimmer.map((s) => [s.id, s.name]))

  const zeilen = [...laeufe]
    .sort((a, b) => (a.startWallMs ?? 0) - (b.startWallMs ?? 0))
    .flatMap((lauf) => {
      const satz = lauf.satzId ? satzName.get(lauf.satzId) : undefined
      const datum = lauf.startWallMs
        ? lokalesDatum(lauf.startWallMs)
        : (satz?.datum ?? '')
      return lauf.bahnen.flatMap((bahn) =>
        bahn.anschlaege.map((anschlag) =>
          [
            satz?.bezeichnung ?? '',
            datum,
            lauf.konfiguration.beckenlaengeM,
            lauf.konfiguration.streckeM ?? '',
            lauf.konfiguration.schwimmart,
            bahn.nummer,
            bahn.schwimmerId ? (schwimmerName.get(bahn.schwimmerId) ?? '') : '',
            anschlag.laengeNr,
            anschlag.splitMs,
            formatTime(anschlag.splitMs),
            anschlag.istFinish ? 1 : 0,
            anschlag.manuell ? 1 : 0,
          ]
            .map(feld)
            .join(TRENNER),
        ),
      )
    })

  return `\uFEFF${[KOPFZEILE.join(TRENNER), ...zeilen].join('\r\n')}\r\n`
}

export function csvDateiname(): string {
  return `beckenrand-${lokalesDatum(Date.now())}.csv`
}
