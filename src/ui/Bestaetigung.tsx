/**
 * Kurzer Bestätigungsdialog für eine einzelne Entscheidung.
 *
 * Baut auf `Dialog` auf (Fokus, Escape, Scroll-Sperre) und beschreibt sich als
 * `alertdialog` mit Titel und Text. Bewusst ist „Abbrechen“ vorfokussiert, damit
 * ein versehentliches Enter nichts löscht; die Bestätigung ist standardmäßig
 * rot, außer bei nicht-destruktiven Aktionen wie einem Import.
 */
import { useId, useRef, type ReactNode } from 'react'
import { Dialog } from './Dialog'

interface BestaetigungProps {
  open: boolean
  titel: string
  text: string
  bestaetigenLabel: string
  /** Standard ist die rote Warnfarbe; Importe sind nicht destruktiv. */
  gefahr?: boolean
  onBestaetigen: () => void
  onAbbrechen: () => void
  /** Zusätzliche Entscheidung zwischen Text und Knöpfen, z. B. eine Option. */
  children?: ReactNode
}

/**
 * Stellt eine Frage mit zwei Antworten. `onAbbrechen` läuft auch beim Klick auf
 * den Hintergrund oder bei Escape, sodass der Dialog nie ohne Entscheidung
 * hängen bleibt.
 */
export function Bestaetigung({
  open,
  titel,
  text,
  bestaetigenLabel,
  gefahr = true,
  onBestaetigen,
  onAbbrechen,
  children,
}: BestaetigungProps) {
  // Ids für `aria-labelledby`/`aria-describedby`; sprechende Texte allein
  // reichen Screenreadern nicht, sie brauchen die Verknüpfung.
  const titelId = useId()
  const textId = useId()
  // Das Abbrechen-Feld bekommt den Startfokus (siehe Dialog).
  const abbrechenRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog
      open={open}
      onClose={onAbbrechen}
      role="alertdialog"
      labelledBy={titelId}
      describedBy={textId}
      backdropLabel="Dialog schließen"
      layerClassName="items-center justify-center p-6"
      panelClassName="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-2xl"
      initialFocusRef={abbrechenRef}
    >
      <h2 id={titelId} className="text-base font-semibold">
        {titel}
      </h2>
      <p id={textId} className="mt-2 text-sm leading-relaxed text-muted">
        {text}
      </p>
      {children}
      <div className="mt-5 flex gap-2">
        {/* Abbrechen steht links und behält den Fokus; die destruktive
            Bestätigung ist die bewusstere zweite Handlung. */}
        <button
          ref={abbrechenRef}
          type="button"
          onClick={onAbbrechen}
          className="h-12 flex-1 rounded-xl border border-line bg-surface2 text-sm font-semibold"
        >
          Abbrechen
        </button>
        <button
          type="button"
          onClick={onBestaetigen}
          className={`h-12 flex-1 rounded-xl text-sm font-semibold ${
            gefahr ? 'bg-danger text-white' : 'bg-accent text-accent-fg'
          }`}
        >
          {bestaetigenLabel}
        </button>
      </div>
    </Dialog>
  )
}
