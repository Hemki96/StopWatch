/**
 * Konfiguration von Lauf und nächstem Lauf.
 *
 * Dasselbe Sheet dient zwei Zwecken: Im Modus „lauf“ ändert es den sichtbaren
 * Lauf (Beckenlänge, Strecke, Schwimmart und die Schwimmer je Bahn), im Modus
 * „einstellungen“ die Vorgaben für den nächsten Lauf samt Bahnzahl, Serie und
 * Schwimmerzuordnung. Die Werte werden direkt in `app/AppProvider` gespeichert;
 * Sperren und Prüfungen kommen aus domain/lauf und domain/serie.
 */
import { useApp } from '../app/AppProvider'
import { formatTakt } from '../domain/format'
import { isStreckeLocked, validateKonfiguration } from '../domain/lauf'
import { istSerie, warnungSeriePlan } from '../domain/serie'
import { SCHWIMMARTEN, type Beckenlaenge, type LaufKonfiguration, type Schwimmart } from '../domain/types'
import { Chip, Feld } from './Felder'
import { Sheet } from './Sheet'

// Feste Auswahlwerte der Chips. Ein bereits gesetzter, hier nicht enthaltener
// Wert (z. B. aus einem Backup) wird später ergänzt, damit er sichtbar bleibt.
const STRECKEN = [50, 100, 200, 400, 800, 1500] as const
const VERSATZE = [0, 5_000, 10_000, 15_000, 20_000, 30_000] as const
const TAKTE = [60, 75, 90, 105, 120, 135, 150, 180, 240] as const

interface KonfigurationSheetProps {
  open: boolean
  onClose: () => void
  /** „lauf“ bearbeitet den sichtbaren Lauf, „einstellungen“ die Vorgaben. */
  modus: 'einstellungen' | 'lauf'
}

/**
 * Sheet für Strecke, Beckenlänge, Schwimmart, Startversatz und Serie.
 *
 * Im Laufmodus sind Strecke, Beckenlänge und Schwimmart nach dem ersten
 * Anschlag gesperrt und bei einer Serie immer, weil alle Runden vorausgeplant
 * sind. Startversatz und Takt sind dort nur informativ; im Einstellungsmodus
 * legen sie den nächsten Lauf fest. Die Schwimmerauswahl schreibt entweder in
 * den Lauf oder in die Vorgaben für den nächsten Lauf.
 */
export function KonfigurationSheet({ open, onClose, modus }: KonfigurationSheetProps) {
  const app = useApp()
  const lauf = app.aktiverLauf
  const satz = app.aktiverSatz
  // Nur im Laufmodus zählt der Plan der aktiven Serie; sonst gelten die
  // Einstellungen für den nächsten Lauf.
  const serie = modus === 'lauf' && istSerie(satz)
  const plan = serie ? (satz?.plan ?? null) : null
  const konfiguration: LaufKonfiguration =
    modus === 'lauf' && lauf ? lauf.konfiguration : app.einstellungen.konfiguration
  // Eine Serie ist nach dem Anlegen fest; ein einzelner Lauf erst nach dem
  // ersten Anschlag. Der Startversatz hat eine eigene Sperre im Laufmodus.
  const gesperrt = modus === 'lauf' && lauf ? isStreckeLocked(lauf) || serie : false
  const fehler = validateKonfiguration(konfiguration)

  // Angezeigte Werte stammen im Laufmodus aus dem Plan bzw. Lauf, sonst aus
  // den Einstellungen. Die Fallbacks halten das Sheet auch ohne Plan stabil.
  const startversatzMs =
    modus === 'lauf' && lauf ? (plan?.startversatzMs ?? lauf.startversatzMs) : app.einstellungen.startversatzMs
  const wiederholungen =
    modus === 'lauf' ? (serie ? (plan?.wiederholungen ?? 1) : 1) : app.einstellungen.wiederholungen
  const taktSek =
    modus === 'lauf' ? (serie ? (plan?.taktSek ?? 120) : 120) : app.einstellungen.taktSek
  // Der aktuelle Wert kann außerhalb der festen Liste liegen; er wird ergänzt
  // und einsortiert, statt stillschweigend auf einen anderen Wert zu springen.
  const taktOptionen = Array.from(new Set<number>([...TAKTE, taktSek])).sort((a, b) => a - b)
  const versatzOptionen = Array.from(new Set<number>([...VERSATZE, startversatzMs])).sort(
    (a, b) => a - b,
  )
  // Warnung nur bei einer geplanten Serie: Der Takt ist kürzer als der
  // Startversatz der letzten Bahn, die nächste Runde überlappt also.
  const warnung =
    modus === 'einstellungen' && wiederholungen > 1
      ? warnungSeriePlan(
          { wiederholungen, taktSek, startversatzMs },
          app.einstellungen.bahnen,
        )
      : null

  /** Übernimmt eine Änderung nur, wenn die Kombination gültig bleibt. */
  const aendere = (teil: Partial<LaufKonfiguration>) => {
    const naechste = { ...konfiguration, ...teil }
    if (validateKonfiguration(naechste) !== null) return
    if (modus === 'lauf') app.setzeKonfiguration(naechste)
    else app.setzeEinstellungen({ ...app.einstellungen, konfiguration: naechste })
  }

  /** Schreibt nur im Einstellungsmodus; im Laufmodus sind diese Felder fest. */
  const setzeEinstellung = (teil: Partial<typeof app.einstellungen>) => {
    if (modus === 'lauf') return
    app.setzeEinstellungen({ ...app.einstellungen, ...teil })
  }

  /**
   * Wechselt die Beckenlänge. Passt die bisherige Strecke nicht mehr als
   * Vielfaches, wird sie auf zwei Beckenlängen gesetzt statt ungültig zu werden.
   */
  const setzeBeckenlaenge = (beckenlaengeM: Beckenlaenge) => {
    const strecke = konfiguration.streckeM
    const naechste =
      strecke !== null && strecke % beckenlaengeM !== 0
        ? { beckenlaengeM, streckeM: beckenlaengeM * 2 }
        : { beckenlaengeM }
    aendere(naechste)
  }

  return (
    <Sheet open={open} onClose={onClose} titel={modus === 'lauf' ? 'Lauf' : 'Nächster Lauf'}>
      <Feld label="Beckenlänge">
        <div className="flex gap-2">
          {([25, 50] as const).map((wert) => (
            <Chip
              key={wert}
              aktiv={konfiguration.beckenlaengeM === wert}
              disabled={gesperrt}
              onClick={() => setzeBeckenlaenge(wert)}
            >
              {wert} m
            </Chip>
          ))}
        </div>
      </Feld>

      <Feld
        label="Strecke"
        hint={
          serie
            ? 'Bei einer Serie nach dem Anlegen gesperrt.'
            : gesperrt
              ? 'Gesperrt, sobald der erste Anschlag erfasst wurde.'
              : 'Bei offener Strecke bestimmt ein eigener Knopf auf der Kachel das Ziel.'
        }
      >
        <div className="flex flex-wrap gap-2">
          {STRECKEN.map((wert) => (
            <Chip
              key={wert}
              aktiv={konfiguration.streckeM === wert}
              disabled={gesperrt}
              onClick={() => aendere({ streckeM: wert })}
            >
              {wert} m
            </Chip>
          ))}
          <Chip
            aktiv={konfiguration.streckeM === null}
            disabled={gesperrt}
            onClick={() => aendere({ streckeM: null })}
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
              aktiv={konfiguration.schwimmart === wert}
              disabled={gesperrt}
              onClick={() => aendere({ schwimmart: wert as Schwimmart })}
            >
              {label}
            </Chip>
          ))}
        </div>
      </Feld>

      <Feld
        label="Startversatz"
        hint={
          modus === 'lauf'
            ? 'Fest beim Anlegen. Ändern unter „Nächster Lauf“.'
            : 'Bahn 1 startet sofort, jede weitere um diesen Abstand später.'
        }
      >
        {/* Im Laufmodus nur lesend: Der Versatz ist beim Anlegen festgelegt. */}
        <div className="flex flex-wrap gap-2">
          {versatzOptionen.map((wert) => (
            <Chip
              key={wert}
              aktiv={startversatzMs === wert}
              disabled={modus === 'lauf'}
              onClick={() => setzeEinstellung({ startversatzMs: wert })}
            >
              {wert === 0 ? 'aus' : `${wert / 1000} s`}
            </Chip>
          ))}
        </div>
      </Feld>

      <Feld
        label="Serie"
        hint="1 = einzelner Lauf. Bei mehreren startet die nächste Runde im festen Takt."
      >
        {/* Der Wert ist im Laufmodus fest; die Grenzen 1 und 20 entsprechen
            den von der Domäne akzeptierten Wiederholungen. */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Weniger Wiederholungen"
            disabled={modus === 'lauf' || wiederholungen <= 1}
            onClick={() => setzeEinstellung({ wiederholungen: wiederholungen - 1 })}
            className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold disabled:opacity-40"
          >
            −
          </button>
          <span className="tabular w-12 text-center text-2xl font-semibold">{wiederholungen}×</span>
          <button
            type="button"
            aria-label="Mehr Wiederholungen"
            disabled={modus === 'lauf' || wiederholungen >= 20}
            onClick={() => setzeEinstellung({ wiederholungen: wiederholungen + 1 })}
            className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold disabled:opacity-40"
          >
            +
          </button>
        </div>

        {wiederholungen > 1 ? (
          <div className="mt-3">
            <p className="mb-2 text-xs text-muted">Takt (Start zu Start)</p>
            <div className="flex flex-wrap gap-2">
              {taktOptionen.map((wert) => (
                <Chip
                  key={wert}
                  aktiv={taktSek === wert}
                  disabled={modus === 'lauf'}
                  onClick={() => setzeEinstellung({ taktSek: wert })}
                >
                  {formatTakt(wert)}
                </Chip>
              ))}
            </div>
          </div>
        ) : null}

        {warnung ? <p className="mt-2 text-xs text-warn">{warnung}</p> : null}
      </Feld>

      {modus === 'einstellungen' ? (
        <Feld label="Bahnen">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Weniger Bahnen"
              onClick={() =>
                app.setzeEinstellungen({
                  ...app.einstellungen,
                  bahnen: Math.max(1, app.einstellungen.bahnen - 1),
                })
              }
              className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold"
            >
              −
            </button>
            <span className="tabular w-10 text-center text-2xl font-semibold">
              {app.einstellungen.bahnen}
            </span>
            <button
              type="button"
              aria-label="Mehr Bahnen"
              onClick={() =>
                app.setzeEinstellungen({
                  ...app.einstellungen,
                  bahnen: Math.min(10, app.einstellungen.bahnen + 1),
                })
              }
              className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold"
            >
              +
            </button>
          </div>
        </Feld>
      ) : null}

      {modus === 'lauf' && lauf ? (
        <Feld label="Schwimmer">
          {/* Bei einer Serie gilt die Zuordnung zeilenweise für alle Runden;
              darum schreibt die Auswahl über `setzeSchwimmerSerie`. */}
          <div className="space-y-2">
            {lauf.bahnen.map((bahn, index) => (
              <div key={bahn.id} className="flex items-center gap-3">
                <span className="tabular w-6 text-sm text-muted">{bahn.nummer}</span>
                <select
                  value={bahn.schwimmerId ?? ''}
                  onChange={(e) =>
                    serie
                      ? app.setzeSchwimmerSerie(index, e.target.value || null)
                      : app.setzeSchwimmer(bahn.id, e.target.value || null)
                  }
                  aria-label={`Schwimmer für Bahn ${bahn.nummer}`}
                  className="h-11 flex-1 rounded-xl border border-line bg-surface2 px-3 text-sm"
                >
                  <option value="">— kein Schwimmer —</option>
                  {app.schwimmer.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {app.schwimmer.length === 0 ? (
            <p className="mt-2 text-xs text-muted">
              Noch keine Schwimmer angelegt. Das geht im Tab „Schwimmer“.
            </p>
          ) : null}
        </Feld>
      ) : (
        <Feld label="Schwimmer für den nächsten Lauf">
          {/* Die Vorgabenliste gehört zu den Einstellungen und wird nur in
              der Länge der eingestellten Bahnzahl angezeigt. */}
          <div className="space-y-2">
            {Array.from({ length: app.einstellungen.bahnen }, (_, index) => (
              <div key={index} className="flex items-center gap-3">
                <span className="tabular w-6 text-sm text-muted">{index + 1}</span>
                <select
                  value={app.einstellungen.schwimmerProBahn[index] ?? ''}
                  onChange={(e) => {
                    const liste = [...app.einstellungen.schwimmerProBahn]
                    liste[index] = e.target.value || null
                    app.setzeEinstellungen({ ...app.einstellungen, schwimmerProBahn: liste })
                  }}
                  aria-label={`Schwimmer für Bahn ${index + 1}`}
                  className="h-11 flex-1 rounded-xl border border-line bg-surface2 px-3 text-sm"
                >
                  <option value="">— kein Schwimmer —</option>
                  {app.schwimmer.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {app.schwimmer.length === 0 ? (
            <p className="mt-2 text-xs text-muted">
              Noch keine Schwimmer angelegt. Das geht im Tab „Schwimmer“.
            </p>
          ) : null}
        </Feld>
      )}

      {/* Die Domäne prüft erneut; hier steht nur, warum eine Kombination nicht
          gespeichert wurde. */}
      {fehler ? <p className="text-sm text-danger">{fehler}</p> : null}
    </Sheet>
  )
}
