/**
 * Auswahlblatt für Exportformate.
 *
 * Ein Export ist oft mehr als eine Datei: Ein Lauf lässt sich als CSV sichern,
 * ein ganzes Training zusätzlich als PDF oder Markdown. Das Sheet zeigt die
 * möglichen Formate als große Zeilen und erklärt kurz, was sie enthalten. Die
 * eigentliche Dateierzeugung bleibt bei den aufrufenden Screens; dieses Modul
 * kennt nur Beschriftungen und Aktionen.
 */
import { Sheet } from './Sheet'

/** Eine auswählbare Exportdatei. */
export interface ExportAktion {
  /** Kurzer Name, z. B. „Als PDF“. */
  label: string
  /** Was die Datei enthält oder wofür sie gedacht ist. */
  beschreibung: string
  onWaehlen: () => void
}

interface ExportSheetProps {
  open: boolean
  titel: string
  /** Einleitung über den Optionen. */
  text: string
  aktionen: ExportAktion[]
  onClose: () => void
}

/** Sheet mit einer Zeile je Exportformat. */
export function ExportSheet({ open, titel, text, aktionen, onClose }: ExportSheetProps) {
  return (
    <Sheet open={open} titel={titel} onClose={onClose}>
      <p className="text-sm leading-relaxed text-muted">{text}</p>
      <div className="mt-4 space-y-2">
        {aktionen.map((aktion, index) => (
          <button
            key={`${aktion.label}-${index}`}
            type="button"
            onClick={aktion.onWaehlen}
            className="w-full rounded-xl border border-line bg-surface2 px-4 py-3 text-left"
          >
            <span className="block text-sm font-semibold">{aktion.label}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">
              {aktion.beschreibung}
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
