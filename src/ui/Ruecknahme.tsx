/**
 * Sichtbare Rücknahme im laufenden Lauf.
 *
 * Langes Drücken bleibt die schnelle Geste direkt auf der Bahn. Für Tastatur,
 * Screenreader und alle, die die Geste nicht kennen, steht zusätzlich in der
 * Fußzeile ein eigener „Zurück“-Knopf. Er liegt außerhalb der Messflächen und
 * kann deshalb nicht durch einen Fehltipp auf einer Kachel ausgelöst werden.
 * Der Knopf nennt sein Ziel (Bahn, Name, Runde) und ist nur aktiv, solange es
 * etwas zurückzunehmen gibt.
 */

/** Ziel der sichtbaren Rücknahme: kurzer Sichttext und voller Vorlesetext. */
export interface RuecknahmeZiel {
  /** Kurzes sichtbares Ziel, etwa „Bahn 2“ oder „Bahn 2 · R3“. */
  kurz: string
  /** Vollständiger Vorlesetext mit Bahn, Name und Runde. */
  lang: string
}

/** Hinweis-Id verbindet den statischen Erklärungstext mit dem Knopf. */
const HINWEIS_ID = 'ruecknahme-hinweis'

/**
 * Zeile mit Erklärung und „Zurück“-Knopf für die Fußzeile des Timers.
 *
 * `ziel === null` heißt: Es gibt nichts zurückzunehmen. Der Knopf bleibt
 * sichtbar, damit die Funktion auffindbar ist, ist aber deaktiviert.
 */
export function Ruecknahme({
  ziel,
  onUndo,
}: {
  ziel: RuecknahmeZiel | null
  onUndo: () => void
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <p id={HINWEIS_ID} className="min-w-0 text-[11px] leading-snug text-muted">
        Langes Drücken oder „Zurück“ nimmt den letzten Anschlag zurück.
      </p>
      <button
        type="button"
        onClick={onUndo}
        disabled={ziel === null}
        aria-describedby={HINWEIS_ID}
        // Der sichtbare Text bleibt im Vorlesetext enthalten („Zurück“), damit
        // Sprachsteuerung den Knopf über seine Beschriftung findet.
        aria-label={
          ziel
            ? `Zurück: letzten Anschlag von ${ziel.lang} zurücknehmen`
            : 'Zurück: nichts zurückzunehmen'
        }
        className="min-h-11 shrink-0 rounded-xl border border-line bg-surface px-3 text-sm font-bold text-fg disabled:opacity-40"
      >
        Zurück{ziel ? ` · ${ziel.kurz}` : ''}
      </button>
    </div>
  )
}
