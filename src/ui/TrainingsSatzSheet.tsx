/**
 * Sheet zum Anlegen und Bearbeiten eines Trainingssatzes.
 *
 * Ein Trainingssatz ist nur der Plan (Konfiguration, Wiederholungen, Takt,
 * Startversatz); erst der Start im Training erzeugt daraus Satz und Läufe. Das
 * Sheet arbeitet auf einer Kopie und meldet erst mit „Speichern“ an den
 * Trainingsscreen zurück, der das ganze Training schreibt. Verschieben und
 * Löschen sind angebunden, aber nur bei bestehenden Sätzen sichtbar.
 */
import { useState } from 'react'
import { formatTakt } from '../domain/format'
import { validateKonfiguration } from '../domain/lauf'
import { pruefeTrainingsSatz } from '../domain/training'
import {
  SCHWIMMARTEN,
  type Beckenlaenge,
  type LaufKonfiguration,
  type TrainingsSatz,
} from '../domain/types'
import { Chip, Feld } from './Felder'
import { Sheet } from './Sheet'

// Feste Chip-Werte wie im Konfigurationssheet; der jeweilige Ist-Wert wird
// bei Bedarf ergänzt, damit importierte Pläne editierbar bleiben.
const STRECKEN = [50, 100, 200, 400, 800, 1500] as const
const VERSATZE = [0, 5_000, 10_000, 15_000, 20_000, 30_000] as const
const TAKTE = [60, 75, 90, 105, 120, 135, 150, 180, 240] as const

interface TrainingsSatzSheetProps {
  /** Der aktuelle Stand; das Sheet arbeitet auf einer Kopie bis zum Speichern. */
  satz: TrainingsSatz
  /** Bahnzahl des Trainings; nur für den Hinweistext der Bezeichnung. */
  bahnen: number
  /** Position in der Satzliste, für Titel und Verschieben. */
  index: number
  /** Neue Sätze lassen sich nicht verschieben oder löschen. */
  istNeu: boolean
  kannNachOben: boolean
  kannNachUnten: boolean
  onClose: () => void
  onSpeichern: (satz: TrainingsSatz) => void
  onLoeschen: () => void
  onVerschieben: (richtung: -1 | 1) => void
}

/**
 * Formular für einen Trainingssatz.
 *
 * Änderungen wirken nur auf den lokalen Entwurf; `pruefeTrainingsSatz` sperrt
 * das Speichern bei ungültiger Strecke, Wiederholungszahl, Takt oder Versatz.
 * Bei einem neuen Satz fehlen Verschieben und Löschen, weil er noch nicht in
 * der Liste steht.
 */
export function TrainingsSatzSheet({
  satz,
  bahnen,
  index,
  istNeu,
  kannNachOben,
  kannNachUnten,
  onClose,
  onSpeichern,
  onLoeschen,
  onVerschieben,
}: TrainingsSatzSheetProps) {
  // Flache Kopie inklusive Konfiguration: Änderungen dürfen den gespeicherten
  // Satz erst beim Speichern berühren.
  const [entwurf, setEntwurf] = useState<TrainingsSatz>(() => ({
    ...satz,
    konfiguration: { ...satz.konfiguration },
  }))

  // Fehler blockieren den Speichern-Knopf; die Meldung steht über den Aktionen.
  const fehler = pruefeTrainingsSatz(entwurf)
  // Ist-Werte außerhalb der festen Liste werden einsortiert ergänzt.
  const taktOptionen = Array.from(new Set<number>([...TAKTE, entwurf.taktSek])).sort(
    (a, b) => a - b,
  )
  const versatzOptionen = Array.from(
    new Set<number>([...VERSATZE, entwurf.startversatzMs]),
  ).sort((a, b) => a - b)

  const aendere = (teil: Partial<TrainingsSatz>) => {
    setEntwurf((aktuell) => ({ ...aktuell, ...teil }))
  }

  /** Übernimmt Konfigurationsänderungen nur, wenn die Kombination gültig ist. */
  const aendereKonfiguration = (teil: Partial<LaufKonfiguration>) => {
    const naechste = { ...entwurf.konfiguration, ...teil }
    if (validateKonfiguration(naechste) !== null) return
    aendere({ konfiguration: naechste })
  }

  /**
   * Beckenwechsel: Eine Strecke, die kein Vielfaches der neuen Beckenlänge ist,
   * wird auf zwei Beckenlängen gesetzt, statt ungültig zu werden.
   */
  const setzeBeckenlaenge = (beckenlaengeM: Beckenlaenge) => {
    const strecke = entwurf.konfiguration.streckeM
    const naechste =
      strecke !== null && strecke % beckenlaengeM !== 0
        ? { beckenlaengeM, streckeM: beckenlaengeM * 2 }
        : { beckenlaengeM }
    aendereKonfiguration(naechste)
  }

  return (
    <Sheet
      open
      onClose={onClose}
      titel={istNeu ? 'Satz hinzufügen' : `Satz ${index + 1} bearbeiten`}
    >
      <Feld label="Bezeichnung" hint={`Gilt für ${bahnen} ${bahnen === 1 ? 'Bahn' : 'Bahnen'}.`}>
        <input
          value={entwurf.bezeichnung}
          onChange={(event) => aendere({ bezeichnung: event.target.value })}
          placeholder="optional, z. B. Einschwimmen"
          aria-label="Bezeichnung des Satzes"
          className="h-11 w-full rounded-xl border border-line bg-surface2 px-3 text-sm"
        />
      </Feld>

      <Feld label="Beckenlänge">
        <div className="flex gap-2">
          {([25, 50] as const).map((wert) => (
            <Chip
              key={wert}
              aktiv={entwurf.konfiguration.beckenlaengeM === wert}
              onClick={() => setzeBeckenlaenge(wert)}
            >
              {wert} m
            </Chip>
          ))}
        </div>
      </Feld>

      <Feld label="Strecke">
        <div className="flex flex-wrap gap-2">
          {STRECKEN.map((wert) => (
            <Chip
              key={wert}
              aktiv={entwurf.konfiguration.streckeM === wert}
              onClick={() => aendereKonfiguration({ streckeM: wert })}
            >
              {wert} m
            </Chip>
          ))}
          <Chip
            aktiv={entwurf.konfiguration.streckeM === null}
            onClick={() => aendereKonfiguration({ streckeM: null })}
          >
            offen
          </Chip>
        </div>
      </Feld>

      <Feld label="Schwimmart">
        <div className="flex flex-wrap gap-2">
          {SCHWIMMARTEN.map(({ wert, label }) => (
            <Chip
              key={wert}
              aktiv={entwurf.konfiguration.schwimmart === wert}
              onClick={() => aendereKonfiguration({ schwimmart: wert })}
            >
              {label}
            </Chip>
          ))}
        </div>
      </Feld>

      <Feld
        label="Wiederholungen"
        hint="1 = einzelner Lauf. Bei mehreren startet die nächste Runde im festen Takt."
      >
        <div className="flex items-center gap-3">
          {/* Grenzen 1 und 20 entsprechen `MAX_WIEDERHOLUNGEN`; der Takt ist
              nur bei mehreren Wiederholungen relevant. */}
          <button
            type="button"
            aria-label="Weniger Wiederholungen"
            disabled={entwurf.wiederholungen <= 1}
            onClick={() => aendere({ wiederholungen: entwurf.wiederholungen - 1 })}
            className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold disabled:opacity-40"
          >
            −
          </button>
          <span className="tabular w-12 text-center text-2xl font-semibold">
            {entwurf.wiederholungen}×
          </span>
          <button
            type="button"
            aria-label="Mehr Wiederholungen"
            disabled={entwurf.wiederholungen >= 20}
            onClick={() => aendere({ wiederholungen: entwurf.wiederholungen + 1 })}
            className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold disabled:opacity-40"
          >
            +
          </button>
        </div>

        {entwurf.wiederholungen > 1 ? (
          <div className="mt-3">
            {/* Takt = Zeit von Start zu Start, nicht die Schwimmzeit. */}
            <p className="mb-2 text-xs text-muted">Takt (Start zu Start)</p>
            <div className="flex flex-wrap gap-2">
              {taktOptionen.map((wert) => (
                <Chip
                  key={wert}
                  aktiv={entwurf.taktSek === wert}
                  onClick={() => aendere({ taktSek: wert })}
                >
                  {formatTakt(wert)}
                </Chip>
              ))}
            </div>
          </div>
        ) : null}
      </Feld>

      <Feld
        label="Startversatz"
        hint="Bahn 1 startet sofort, jede weitere um diesen Abstand später."
      >
        <div className="flex flex-wrap gap-2">
          {versatzOptionen.map((wert) => (
            <Chip
              key={wert}
              aktiv={entwurf.startversatzMs === wert}
              onClick={() => aendere({ startversatzMs: wert })}
            >
              {wert === 0 ? 'aus' : `${wert / 1000} s`}
            </Chip>
          ))}
        </div>
      </Feld>

      {fehler ? <p className="mb-3 text-sm text-danger">{fehler}</p> : null}

      <button
        type="button"
        disabled={fehler !== null}
        onClick={() =>
          // Bezeichnung trimmen; der Trainingsscreen ersetzt den Satz anhand
          // seiner ID und schließt das Sheet.
          onSpeichern({ ...entwurf, bezeichnung: entwurf.bezeichnung.trim() })
        }
        className="h-14 w-full rounded-xl bg-accent text-base font-bold text-accent-fg disabled:opacity-40"
      >
        {istNeu ? 'Satz hinzufügen' : 'Satz speichern'}
      </button>

      {/* Verschieben und Löschen gibt es nur für bereits gespeicherte Sätze;
          die Grenzen kommen als `kannNachOben`/`kannNachUnten` vom Screen. */}
      {istNeu ? null : (
        <div className="mt-4 space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!kannNachOben}
              onClick={() => onVerschieben(-1)}
              className="h-11 flex-1 rounded-xl border border-line bg-surface2 text-sm font-semibold disabled:opacity-40"
            >
              Nach oben
            </button>
            <button
              type="button"
              disabled={!kannNachUnten}
              onClick={() => onVerschieben(1)}
              className="h-11 flex-1 rounded-xl border border-line bg-surface2 text-sm font-semibold disabled:opacity-40"
            >
              Nach unten
            </button>
          </div>
          <button
            type="button"
            onClick={onLoeschen}
            className="h-11 w-full rounded-xl border border-danger/40 bg-danger/10 text-sm font-semibold text-danger"
          >
            Satz löschen
          </button>
        </div>
      )}
    </Sheet>
  )
}
