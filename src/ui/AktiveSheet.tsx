/**
 * Sheet zum Festlegen der Aktiven eines Trainings.
 *
 * Bahnen je Reihe, Reihenzahl und Schwimmer je Bahn gelten für alle noch nicht
 * gestarteten Sätze. Der Entwurf wird lokal gehalten und erst mit „Aktive
 * übernehmen“ an den App-Kontext gegeben; Schließen verwirft ihn. Die
 * Obergrenzen kommen aus domain/training.
 */
import { useState } from 'react'
import { MAX_BAHNEN, MAX_REIHEN, bahnenGesamt, ordneAktiveUm } from '../domain/training'
import type { Schwimmer, Training } from '../domain/types'
import { Feld } from './Felder'
import { Sheet } from './Sheet'

interface AktiveSheetProps {
  training: Training
  schwimmer: Schwimmer[]
  onClose: () => void
  /** Übernimmt Bahnenzahl je Reihe, Reihenzahl und Zuordnung für die kommenden Sätze. */
  onSpeichern: (bahnen: number, reihen: number, aktive: (string | null)[]) => void
}

/**
 * Sheet, in dem der Trainer Bahnen je Reihe, Reihenzahl und Besetzung für die
 * kommenden Sätze festlegt. Minus/Plus ändern die Werte, je Bahn wählt ein
 * Auswahlfeld den Schwimmer. `onSpeichern` übernimmt den Entwurf; `onClose`
 * verwirft ihn.
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
  const [reihen, setReihen] = useState(training.reihen)
  const [aktive, setAktive] = useState<(string | null)[]>(() => [...training.aktive])
  // Gelöschte Schwimmer können noch als Id in den Aktiven stehen. Der Abgleich
  // verhindert, dass das Auswahlfeld einen Wert anzeigt, den es nicht gibt.
  const bekannteIds = new Set(schwimmer.map((eintrag) => eintrag.id))

  /**
   * Ändert Bahnen je Reihe und Reihenzahl gemeinsam. Bestehende Zuordnungen
   * bleiben an ihrer Position, fehlende Plätze werden mit null aufgefüllt.
   */
  const setzeAufteilung = (naechsteBahnen: number, naechsteReihen: number) => {
    const bahnenAnzahl = Math.min(MAX_BAHNEN, Math.max(1, naechsteBahnen))
    const reihenAnzahl = Math.min(MAX_REIHEN, Math.max(1, naechsteReihen))
    setAktive((aktuell) =>
      ordneAktiveUm(
        aktuell,
        { bahnen, reihen },
        { bahnen: bahnenAnzahl, reihen: reihenAnzahl },
      ),
    )
    setBahnen(bahnenAnzahl)
    setReihen(reihenAnzahl)
  }

  /** Setzt einen Schwimmer auf eine Bahn, ohne die übrigen zu verschieben. */
  const setzeAktiven = (index: number, schwimmerId: string | null) => {
    setAktive((aktuell) => aktuell.map((wert, i) => (i === index ? schwimmerId : wert)))
  }

  return (
    <Sheet open onClose={onClose} titel="Aktive">
      <Feld
        label="Bahnen pro Reihe"
        hint="Wie viele Personen gleichzeitig starten. Die Zahl gilt für alle noch nicht gestarteten Sätze. Gestartete Sätze behalten ihre Bahnen."
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Weniger Bahnen pro Reihe"
            disabled={bahnen <= 1}
            onClick={() => setzeAufteilung(bahnen - 1, reihen)}
            className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold disabled:opacity-40"
          >
            −
          </button>
          <span className="tabular w-10 text-center text-2xl font-semibold">{bahnen}</span>
          <button
            type="button"
            aria-label="Mehr Bahnen pro Reihe"
            disabled={bahnen >= MAX_BAHNEN}
            onClick={() => setzeAufteilung(bahnen + 1, reihen)}
            className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold disabled:opacity-40"
          >
            +
          </button>
        </div>
      </Feld>

      <Feld
        label="Reihen"
        hint="Jede Reihe startet gemeinsam; die nächste nach dem Reihenversatz des Satzes."
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Weniger Reihen"
            disabled={reihen <= 1}
            onClick={() => setzeAufteilung(bahnen, reihen - 1)}
            className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold disabled:opacity-40"
          >
            −
          </button>
          <span className="tabular w-10 text-center text-2xl font-semibold">{reihen}</span>
          <button
            type="button"
            aria-label="Mehr Reihen"
            disabled={reihen >= MAX_REIHEN}
            onClick={() => setzeAufteilung(bahnen, reihen + 1)}
            className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold disabled:opacity-40"
          >
            +
          </button>
          <span className="text-sm text-muted">
            {bahnenGesamt(bahnen, reihen)} Personen
          </span>
        </div>
      </Feld>

      <Feld label="Wer schwimmt mit?">
        <div className="space-y-3">
          {/* Ein Abschnitt pro Reihe, darin eine Auswahlzeile pro Bahn; die
              Bahnnummer ist nur Anzeige, keine Eingabe. */}
          {Array.from({ length: reihen }, (_, reiheIndex) => (
            <div key={reiheIndex} className="space-y-2">
              {reihen > 1 ? (
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                  Reihe {reiheIndex + 1}
                </p>
              ) : null}
              {Array.from({ length: bahnen }, (_, bahnIndex) => {
                const index = reiheIndex * bahnen + bahnIndex
                const wert = aktive[index] ?? null
                return (
                  <div key={index} className="flex items-center gap-3">
                    <span className="tabular w-6 text-sm text-muted">{bahnIndex + 1}</span>
                    <select
                      // Unbekannte Ids (gelöschter Schwimmer) werden als „kein
                      // Schwimmer“ angezeigt, statt eine leere Option zu erzeugen.
                      value={wert && bekannteIds.has(wert) ? wert : ''}
                      onChange={(event) => setzeAktiven(index, event.target.value || null)}
                      aria-label={`Schwimmer für Reihe ${reiheIndex + 1}, Bahn ${bahnIndex + 1}`}
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
          ))}
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
        onClick={() => onSpeichern(bahnen, reihen, aktive)}
        className="h-14 w-full rounded-xl bg-accent text-base font-bold text-accent-fg"
      >
        Aktive übernehmen
      </button>
    </Sheet>
  )
}
