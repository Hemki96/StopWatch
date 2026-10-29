import { useApp } from '../app/AppProvider'
import { isStreckeLocked, validateKonfiguration } from '../domain/lauf'
import { SCHWIMMARTEN, type Beckenlaenge, type LaufKonfiguration, type Schwimmart } from '../domain/types'
import { Sheet } from './Sheet'

const STRECKEN = [50, 100, 200, 400, 800, 1500] as const

interface KonfigurationSheetProps {
  open: boolean
  onClose: () => void
  modus: 'einstellungen' | 'lauf'
}

function Feld({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">{label}</h3>
      {children}
      {hint ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
    </section>
  )
}

function Chip({
  aktiv,
  disabled,
  onClick,
  children,
}: {
  aktiv: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-11 min-w-11 rounded-xl border px-3 text-sm font-semibold transition-colors disabled:opacity-40 ${
        aktiv
          ? 'border-accent bg-accent text-accent-fg'
          : 'border-line bg-surface2 text-fg'
      }`}
    >
      {children}
    </button>
  )
}

export function KonfigurationSheet({ open, onClose, modus }: KonfigurationSheetProps) {
  const app = useApp()
  const lauf = app.aktiverLauf
  const konfiguration: LaufKonfiguration =
    modus === 'lauf' && lauf ? lauf.konfiguration : app.einstellungen.konfiguration
  const gesperrt = modus === 'lauf' && lauf ? isStreckeLocked(lauf) : false
  const fehler = validateKonfiguration(konfiguration)

  const aendere = (teil: Partial<LaufKonfiguration>) => {
    const naechste = { ...konfiguration, ...teil }
    if (validateKonfiguration(naechste) !== null) return
    if (modus === 'lauf') app.setzeKonfiguration(naechste)
    else app.setzeEinstellungen({ ...app.einstellungen, konfiguration: naechste })
  }

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
          gesperrt
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
              onClick={() => aendere({ schwimmart: wert as Schwimmart })}
            >
              {label}
            </Chip>
          ))}
        </div>
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
          <div className="space-y-2">
            {lauf.bahnen.map((bahn) => (
              <div key={bahn.id} className="flex items-center gap-3">
                <span className="tabular w-6 text-sm text-muted">{bahn.nummer}</span>
                <select
                  value={bahn.schwimmerId ?? ''}
                  onChange={(e) => app.setzeSchwimmer(bahn.id, e.target.value || null)}
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

      {fehler ? <p className="text-sm text-danger">{fehler}</p> : null}
    </Sheet>
  )
}
