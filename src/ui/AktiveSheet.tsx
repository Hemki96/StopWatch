/**
 * Sheet zum Festlegen der Aktiven eines Trainings.
 *
 * Bahnzahl und Schwimmer je Bahn gelten für alle noch nicht gestarteten Sätze.
 * Der Entwurf wird lokal gehalten und erst mit „Aktive übernehmen“ an den
 * App-Kontext gegeben; Schließen verwirft ihn. Die Obergrenze der Bahnen kommt
 * aus domain/training.
 */
import { useState } from 'react'
import { MAX_BAHNEN } from '../domain/training'
import type { Schwimmer, Training } from '../domain/types'
import { Feld } from './Felder'
import { Sheet } from './Sheet'

interface AktiveSheetProps {
  training: Training
  schwimmer: Schwimmer[]
  onClose: () => void
  /** Übernimmt Bahnzahl und Zuordnung für die kommenden Sätze. */
  onSpeichern: (bahnen: number, aktive: (string | null)[]) => void
}

/**
 * Sheet, in dem der Trainer Bahnzahl und Besetzung für die kommenden Sätze
 * festlegt. Minus/Plus ändern die Bahnzahl, je Bahn wählt ein Auswahlfeld den
 * Schwimmer. `onSpeichern` übernimmt den Entwurf; `onClose` verwirft ihn.
 *
 * Die Aktiven gelten für alle noch nicht gestarteten Sätze. Bereits gestartete
 * Sätze behalten ihre Bahnen, damit gemessene Zeiten nicht nachträglich
 * umgeschrieben werden.
 */
export function AktiveSheet({
  training,
  schwimmer,
  onClose,
  onSpeichern,
}: AktiveSheetProps) {
  // Lokaler Entwurf: Änderungen wirken erst beim Speichern.
  const [bahnen, setBahnen] = useState(training.bahnen)
  const [aktive, setAktive] = useState<(string | null)[]>(() => [...training.aktive])
  // Gelöschte Schwimmer können noch als Id in den Aktiven stehen. Der Abgleich
  // verhindert, dass das Auswahlfeld einen Wert anzeigt, den es nicht gibt.
  const bekannteIds = new Set(schwimmer.map((eintrag) => eintrag.id))

  /** Klemmt die Bahnzahl auf 1..MAX_BAHNEN und behält bestehende Zuordnungen. */
  const setzeBahnen = (anzahl: number) => {
    const naechste = Math.min(MAX_BAHNEN, Math.max(1, anzahl))
    setBahnen(naechste)
    setAktive((aktuell) =>
      Array.from({ length: naechste }, (_, index) => aktuell[index] ?? null),
    )
  }

  /** Setzt einen Schwimmer auf eine Bahn, ohne die übrigen zu verschieben. */
  const setzeAktiven = (index: number, schwimmerId: string | null) => {
    setAktive((aktuell) => aktuell.map((wert, i) => (i === index ? schwimmerId : wert)))
  }

  return (
    <Sheet open onClose={onClose} titel="Aktive">
      <Feld
        label="Bahnen"
        hint="Die Zahl gilt für alle noch nicht gestarteten Sätze. Gestartete Sätze behalten ihre Bahnen."
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Weniger Bahnen"
            disabled={bahnen <= 1}
            onClick={() => setzeBahnen(bahnen - 1)}
            className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold disabled:opacity-40"
          >
            −
          </button>
          <span className="tabular w-10 text-center text-2xl font-semibold">{bahnen}</span>
          <button
            type="button"
            aria-label="Mehr Bahnen"
            disabled={bahnen >= MAX_BAHNEN}
            onClick={() => setzeBahnen(bahnen + 1)}
            className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold disabled:opacity-40"
          >
            +
          </button>
        </div>
      </Feld>

      <Feld label="Wer schwimmt mit?">
        <div className="space-y-2">
          {/* Eine Auswahlzeile pro Bahn; die Bahnnummer ist nur Anzeige, keine
              Eingabe. */}
          {Array.from({ length: bahnen }, (_, index) => {
            const wert = aktive[index] ?? null
            return (
              <div key={index} className="flex items-center gap-3">
                <span className="tabular w-6 text-sm text-muted">{index + 1}</span>
                <select
                  // Unbekannte Ids (gelöschter Schwimmer) werden als „kein
                  // Schwimmer“ angezeigt, statt eine leere Option zu erzeugen.
                  value={wert && bekannteIds.has(wert) ? wert : ''}
                  onChange={(event) => setzeAktiven(index, event.target.value || null)}
                  aria-label={`Schwimmer für Bahn ${index + 1}`}
                  className="h-11 flex-1 rounded-xl border border-line bg-surface2 px-3 text-sm"
                >
                  <option value="">— kein Schwimmer —</option>
                  {schwimmer.map((eintrag) => (
                    <option key={eintrag.id} value={eintrag.id}>
                      {eintrag.name}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
        {schwimmer.length === 0 ? (
          <p className="mt-2 text-xs text-muted">
            Noch keine Schwimmer angelegt. Das geht im Tab „Schwimmer“.
          </p>
        ) : null}
      </Feld>

      {/* Erst hier wird der Entwurf verbindlich; ohne Klick bleibt der Plan
          unverändert. */}
      <button
        type="button"
        onClick={() => onSpeichern(bahnen, aktive)}
        className="h-14 w-full rounded-xl bg-accent text-base font-bold text-accent-fg"
      >
        Aktive übernehmen
      </button>
    </Sheet>
  )
}
