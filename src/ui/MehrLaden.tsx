/**
 * Fußzeile seitenweise gerenderter Satzlisten.
 *
 * Verlauf und Analyse teilen Seitengröße, Wortlaut und Markup: Der Zähler nennt
 * den bereits gerenderten Anteil, „Mehr laden“ ergänzt darunter, ohne
 * Sortierung oder Scrollposition zu verschieben. Die Statusrolle liest die
 * Ergänzung vor; der Knopf bleibt unter der Liste, damit neue Einträge nach
 * unten wachsen und der Blick nicht springt.
 */

/**
 * Höchstzahl der Sätze, die eine Liste zunächst rendert.
 *
 * Ein großer Bestand soll das Öffnen nicht ausbremsen: 50 Zeilen füllen auch
 * auf dem Tablet mehrere Bildschirme und begrenzen die DOM-Größe, ohne dass
 * die erste Ansicht leer wirkt.
 */
export const SAETZE_JE_SEITE = 50

export function MehrLaden({
  sichtbar,
  gesamt,
  onMehr,
}: {
  sichtbar: number
  gesamt: number
  onMehr: () => void
}) {
  if (gesamt === 0) return null
  const weitere = gesamt - sichtbar

  return (
    <div className="mt-6 flex flex-col items-center gap-2">
      <p className="text-xs text-muted" role="status">
        {`${sichtbar} von ${gesamt} ${gesamt === 1 ? 'Satz' : 'Sätzen'} angezeigt`}
      </p>
      {weitere > 0 ? (
        <button
          type="button"
          onClick={onMehr}
          className="h-12 w-full max-w-sm rounded-xl border border-line bg-surface text-sm font-semibold"
        >
          Mehr laden
          <span className="ml-2 text-xs font-normal text-muted">
            {weitere} {weitere === 1 ? 'weiterer Satz' : 'weitere Sätze'}
          </span>
        </button>
      ) : null}
    </div>
  )
}
