/**
 * Schnellzuordnung von Schwimmern auf freie Plätze.
 *
 * Ein Tipp legt die Person auf den nächsten freien Platz, ein zweiter Tipp
 * entfernt sie wieder. Die vorhandenen Auswahlfelder bleiben darunter als
 * präziser Weg erhalten; diese Leiste ist für den schnellen Fall am
 * Beckenrand gedacht, wenn sechs bis zehn Namen verteilt werden müssen.
 *
 * Die Komponente kennt keine Domäne: Sie bekommt die aktuelle Zuordnung als
 * Liste (ein Eintrag je Platz, `null` = frei) und meldet Platz und neue
 * Schwimmer-ID zurück.
 */
import type { Schwimmer } from '../domain/types'

export function SchwimmerSchnellwahl({
  schwimmer,
  zuordnung,
  onAendern,
}: {
  schwimmer: Schwimmer[]
  /** Ein Eintrag je Platz, Reihe für Reihe; `null` heißt frei. */
  zuordnung: (string | null)[]
  onAendern: (schwimmerId: string | null, platz: number) => void
}) {
  if (schwimmer.length === 0) return null

  // Erster belegter Platz je Person. Doppelte Zuordnungen werden nicht
  // erzeugt; sollte ein Bestand sie enthalten, gewinnt der erste Platz.
  const belegt = new Map<string, number>()
  zuordnung.forEach((id, platz) => {
    if (id && !belegt.has(id)) belegt.set(id, platz)
  })
  // Fehlende Einträge (undefined) gelten ebenfalls als frei, nicht als belegt.
  const freierPlatz = zuordnung.findIndex((id) => id == null)
  const alleBelegt = freierPlatz === -1 && zuordnung.length > 0

  return (
    <div className="mb-3">
      <div className="flex flex-wrap gap-2">
        {schwimmer.map((person) => {
          const platz = belegt.get(person.id)
          const aktiv = platz !== undefined
          // Ohne freien Platz bleibt nur das Entfernen möglich; die Erklärung
          // steht direkt unter der Leiste.
          const gesperrt = !aktiv && alleBelegt
          return (
            <button
              key={person.id}
              type="button"
              aria-pressed={aktiv}
              disabled={gesperrt}
              onClick={() => {
                if (platz !== undefined) onAendern(null, platz)
                else if (!gesperrt) onAendern(person.id, freierPlatz)
              }}
              className={`h-11 rounded-xl border px-3 text-sm font-semibold transition-colors disabled:opacity-40 ${
                aktiv
                  ? 'border-accent bg-accent text-accent-fg'
                  : 'border-line bg-surface2 text-fg'
              }`}
            >
              {person.name}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-muted">
        {alleBelegt
          ? 'Alle Plätze sind belegt. Erneutes Tippen auf eine Person entfernt sie.'
          : 'Tippen legt die Person auf den nächsten freien Platz; erneutes Tippen entfernt sie.'}
      </p>
    </div>
  )
}
