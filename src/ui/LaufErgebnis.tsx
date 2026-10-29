/**
 * Ergebnisübersicht eines einzelnen, vollständig beendeten Laufs.
 *
 * Nach dem letzten Ziel ersetzt sie die Bahnkacheln im Timer: Je Bahn stehen
 * Bahnnummer, Schwimmer, Zielzeit und der Vergleich mit der Bestzeit. Neu ist
 * die Marke **Bestzeit**, sonst der Rückstand zum PB; ohne PB (offene Strecke,
 * fehlender Schwimmer) bleibt der Vergleich weg. Korrigierte Zeiten tragen
 * weiterhin **korrigiert**.
 *
 * Die Komponente rechnet nicht selbst: Die Bestzeiten kommen aus
 * `berechnePbs`/`pbDelta` in domain/analyse, die Namen und Aktionen aus dem
 * TimerScreen. Der Rückweg „Neuer Lauf“ bleibt in der Fußzeile des Timers.
 */
import { berechnePbs, pbDelta } from '../domain/analyse'
import { formatDelta, formatStrecke, formatTime } from '../domain/format'
import { finishMs } from '../domain/lauf'
import type { Lauf } from '../domain/types'

/** Eine Zeile der Übersicht, nach Zielzeit sortiert. */
interface ErgebnisZeile {
  bahnId: string
  nummer: number
  ms: number | null
  /** Zeit ist die aktuelle Bestzeit der Kombination. */
  istPb: boolean
  /** Abstand zur Bestzeit; 0 nur, wenn die Zeit selbst die Bestzeit ist. */
  deltaMs: number | null
  /** Zielzeit wurde von Hand korrigiert. */
  korrigiert: boolean
}

/**
 * Baut die Anzeigezeilen aus einem Lauf. Die Bestzeiten werden über alle
 * übergebenen Läufe berechnet, damit der Vergleich nicht nur innerhalb dieses
 * Laufs gilt.
 *
 * Sortiert wird nach angezeigter Zielzeit, offene Bahnen stehen am Ende. Bei
 * fehlender Zeit gibt es weder Badge noch Rückstand.
 */
export function ergebnisZeilen(lauf: Lauf, alleLaeufe: Lauf[]): ErgebnisZeile[] {
  const pbs = berechnePbs(alleLaeufe)
  return lauf.bahnen
    .map((bahn) => {
      const ms = finishMs(bahn)
      const delta = pbDelta(pbs, lauf, bahn)
      const finishAnschlag = bahn.anschlaege.find((anschlag) => anschlag.istFinish)
      return {
        bahnId: bahn.id,
        nummer: bahn.nummer,
        ms,
        istPb: delta?.istPb ?? false,
        deltaMs: delta?.deltaMs ?? null,
        korrigiert: finishAnschlag?.manuell === true,
      }
    })
    .sort((a, b) => {
      // Offene Bahnen ans Ende; sonst zählt die Zeit, bei Gleichstand die
      // Bahnnummer für eine stabile Reihenfolge.
      if (a.ms === null && b.ms === null) return a.nummer - b.nummer
      if (a.ms === null) return 1
      if (b.ms === null) return -1
      return a.ms - b.ms || a.nummer - b.nummer
    })
}

/** Ergebnisübersicht mit Bestzeit-Vergleich und Rückweg über die Fußzeile. */
export function LaufErgebnis({
  lauf,
  laeufe,
  schwimmerName,
  onUndo,
}: {
  lauf: Lauf
  /** Alle geladenen Läufe, Grundlage der Bestzeiten. */
  laeufe: Lauf[]
  schwimmerName: (id: string | null) => string | null
  /** Nimmt das Ziel einer Bahn zurück, damit ein Fehltipp korrigierbar bleibt. */
  onUndo: (bahnId: string) => void
}) {
  const zeilen = ergebnisZeilen(lauf, laeufe)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3 rail:p-4">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Ergebnis</h2>
          <p className="text-[11px] text-muted">
            {zeilen.length} {zeilen.length === 1 ? 'Bahn' : 'Bahnen'} ·{' '}
            {formatStrecke(lauf.konfiguration.streckeM)}
          </p>
        </div>

        <ol className="mt-2 space-y-1.5">
          {zeilen.map((zeile) => (
            <li
              key={zeile.bahnId}
              data-bahn={zeile.nummer}
              data-pb={zeile.istPb ? 'true' : undefined}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2"
            >
              <span className="tabular grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface2 text-sm font-bold text-muted">
                {zeile.nummer}
              </span>
              <div className="min-w-0 flex-1">
                {/* Ohne Schwimmer bleibt die Bahn sichtbar, aber ohne
                    Bestzeit-Vergleich: Ein PB braucht eine Person. */}
                <p className="truncate text-sm font-semibold">
                  {schwimmerName(lauf.bahnen.find((bahn) => bahn.id === zeile.bahnId)?.schwimmerId ?? null) ??
                    'Ohne Namen'}
                </p>
                <p className="text-[11px] text-muted">
                  {zeile.istPb ? (
                    <span className="rounded bg-ok/15 px-1.5 py-0.5 text-[10px] font-bold text-ok">
                      Bestzeit
                    </span>
                  ) : zeile.deltaMs !== null ? (
                    <span className="tabular">{formatDelta(zeile.deltaMs)} zum PB</span>
                  ) : (
                    <span>kein PB</span>
                  )}
                  {zeile.korrigiert ? ' · korrigiert' : ''}
                </p>
              </div>
              <p
                className={`tabular shrink-0 text-xl font-semibold ${zeile.ms === null ? 'text-muted' : 'text-fg'}`}
              >
                {zeile.ms === null ? '—' : formatTime(zeile.ms)}
              </p>
              <button
                type="button"
                onClick={() => onUndo(zeile.bahnId)}
                aria-label={`Ziel von Bahn ${zeile.nummer} zurücknehmen`}
                className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-muted"
              >
                Zurück
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
