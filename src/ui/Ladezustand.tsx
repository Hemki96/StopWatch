/**
 * Ladezustände für per `React.lazy` nachgeladene Bereiche.
 *
 * Der Fallback ersetzt die Fläche des kommenden Screens, statt sie zu
 * verschieben: `h-full`/`flex-1` halten die Höhe, sodass die Tab-Leiste und der
 * Kopfbereich stehen bleiben. Als `role="status"` mit `aria-live="polite"` wird
 * der Wechsel vorgelesen, ohne den Fokus zu verschieben — die auslösende
 * Schaltfläche bleibt fokussiert, bis der Screen oder Dialog erscheint.
 *
 * Zwei Varianten: `BereichLadezustand` füllt den Inhaltsbereich eines Tabs,
 * `DialogLadezustand` deckt dieselbe Vollbild-Fläche wie das Lauf-Detail ab.
 * Beide sind rein darstellend und kennen keine Fachlogik.
 */
import type { ReactNode } from 'react'

interface LadezustandProps {
  /** Vorlesetext; nennt den erwarteten Bereich, damit die Ansage konkret ist. */
  text?: string
}

/** Kreisförmiger Fortschritt; rein dekorativ, der Text trägt die Bedeutung. */
function Ladekreis() {
  return (
    <span
      aria-hidden="true"
      className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent"
    />
  )
}

/** Umschließt eine Statusmeldung mit dem gemeinsamen Layout der Ladefläche. */
function Ladeinhalt({ text }: { text: ReactNode }) {
  return (
    <>
      <Ladekreis />
      <span>{text}</span>
    </>
  )
}

/**
 * Ladefläche für einen Tab. Füllt den verfügbaren Platz des Rahmens, damit
 * beim Eintreffen des Chunks nichts springt.
 */
export function BereichLadezustand({
  text = 'Bereich wird geladen …',
}: LadezustandProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted"
    >
      <Ladeinhalt text={text} />
    </div>
  )
}

/**
 * Ladefläche für eine Vollbild-Detailansicht. Sie liegt über dem Screen, den
 * der Nutzer gerade sieht, und hält den Fokus beim Auslöser. Der eigentliche
 * `Dialog` übernimmt Fokusfalle und History-Eintrag erst, wenn er gemountet
 * ist — die Zurück-Geste verhält sich dadurch unverändert.
 */
export function DialogLadezustand({
  text = 'Detail wird geladen …',
}: LadezustandProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="safe-x fixed inset-0 z-40 flex flex-col bg-bg text-sm text-muted"
    >
      <div className="flex items-center gap-3 border-b border-line px-4 py-3 rail:px-6">
        <Ladekreis />
        <span>{text}</span>
      </div>
    </div>
  )
}
