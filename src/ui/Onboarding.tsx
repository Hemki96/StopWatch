import { useState } from 'react'
import { useApp } from '../app/AppProvider'
import { STANDARD_KONFIGURATION, lengthCount, validateKonfiguration } from '../domain/lauf'
import { SCHWIMMARTEN, type Beckenlaenge, type LaufKonfiguration } from '../domain/types'

const STRECKEN = [50, 100, 200, 400, 800, 1500] as const

const SCHRITTE = ['So funktioniert es', 'Becken und Strecke', 'Bahnen und Namen'] as const

function Auswahl({
  aktiv,
  onClick,
  children,
}: {
  aktiv: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aktiv}
      className={`h-11 rounded-xl border px-3 text-sm font-semibold ${
        aktiv ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface2 text-fg'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Erststart in drei Schritten. Der Abschluss wird lokal gemerkt; ein
 * zurückgesetztes Gerät zeigt das Onboarding erneut.
 */
export function Onboarding({ onFertig }: { onFertig: () => void }) {
  const app = useApp()
  const [schritt, setSchritt] = useState(0)
  const [konfiguration, setKonfiguration] = useState<LaufKonfiguration>({
    ...app.einstellungen.konfiguration,
  })
  const [bahnen, setBahnen] = useState(app.einstellungen.bahnen)
  const [namen, setNamen] = useState<string[]>(() =>
    Array.from({ length: 10 }, (_, i) => {
      const id = app.einstellungen.schwimmerProBahn[i]
      return id ? (app.schwimmer.find((s) => s.id === id)?.name ?? '') : ''
    }),
  )

  const setzeBeckenlaenge = (beckenlaengeM: Beckenlaenge) => {
    const strecke = konfiguration.streckeM
    setKonfiguration({
      ...konfiguration,
      beckenlaengeM,
      streckeM:
        strecke !== null && strecke % beckenlaengeM !== 0 ? beckenlaengeM * 2 : strecke,
    })
  }

  const speichereNamen = () => {
    // Innerhalb dieses Durchlaufs angelegte Namen sofort merken: `app.schwimmer`
    // ist erst nach dem nächsten Rendern aktuell und würde sonst Duplikate
    // anlegen, wenn derselbe Name auf zwei Bahnen steht.
    const neu = new Map<string, string>()
    return Array.from({ length: bahnen }, (_, index) => {
      const name = namen[index]?.trim()
      if (!name) return null
      const schluessel = name.toLocaleLowerCase('de')
      const vorhanden = app.schwimmer.find(
        (s) => s.name.toLocaleLowerCase('de') === schluessel,
      )
      if (vorhanden) return vorhanden.id
      const bereitsAngelegt = neu.get(schluessel)
      if (bereitsAngelegt) return bereitsAngelegt
      const eintrag = app.speichereSchwimmer({ name, jahrgang: null, notiz: '' })
      if (!eintrag) return null
      neu.set(schluessel, eintrag.id)
      return eintrag.id
    })
  }

  const abschliessen = () => {
    if (validateKonfiguration(konfiguration) !== null) return
    app.setzeEinstellungen({
      konfiguration,
      bahnen,
      schwimmerProBahn: speichereNamen(),
      startversatzMs: 0,
      wiederholungen: 1,
      taktSek: 120,
    })
    onFertig()
  }

  const ueberspringen = () => {
    app.setzeEinstellungen({
      konfiguration: { ...STANDARD_KONFIGURATION },
      bahnen: 6,
      schwimmerProBahn: [],
      startversatzMs: 0,
      wiederholungen: 1,
      taktSek: 120,
    })
    onFertig()
  }

  const laengen = lengthCount(konfiguration)
  const gesamtLaengen = laengen ? `${laengen} Längen` : 'offene Strecke'

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-accent">
          Schritt {schritt + 1} von 3
        </p>
        <h1 className="mt-1 text-lg font-semibold">{SCHRITTE[schritt]}</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-5">
        {schritt === 0 ? (
          <div className="space-y-4 text-sm leading-relaxed text-muted">
            <p>
              Ein <strong className="text-fg">Lauf</strong> ist eine Messung über eine feste
              Strecke. Er besteht aus mehreren{' '}
              <strong className="text-fg">Bahnen</strong>, die gemeinsam starten — eine Bahn pro
              Schwimmer.
            </p>
            <p>
              Du tippst jede Bahn bei jedem{' '}
              <strong className="text-fg">Anschlag</strong> an. Der letzte Anschlag ist das Ziel.
              Langes Drücken nimmt die letzte Aktion zurück.
            </p>
            <p>
              Alles bleibt auf diesem Gerät. Ohne Konto, ohne Netz — am Beckenrand gebaut für eine
              Hand und nasse Finger.
            </p>
          </div>
        ) : null}

        {schritt === 1 ? (
          <div className="space-y-6">
            <section>
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                Beckenlänge
              </h2>
              <div className="flex gap-2">
                {([25, 50] as const).map((wert) => (
                  <Auswahl
                    key={wert}
                    aktiv={konfiguration.beckenlaengeM === wert}
                    onClick={() => setzeBeckenlaenge(wert)}
                  >
                    {wert} m
                  </Auswahl>
                ))}
              </div>
            </section>

            <section>
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                Strecke
              </h2>
              <div className="flex flex-wrap gap-2">
                {STRECKEN.map((wert) => (
                  <Auswahl
                    key={wert}
                    aktiv={konfiguration.streckeM === wert}
                    onClick={() => setKonfiguration({ ...konfiguration, streckeM: wert })}
                  >
                    {wert} m
                  </Auswahl>
                ))}
                <Auswahl
                  aktiv={konfiguration.streckeM === null}
                  onClick={() => setKonfiguration({ ...konfiguration, streckeM: null })}
                >
                  Offene Strecke
                </Auswahl>
              </div>
              <p className="mt-2 text-xs text-muted">{gesamtLaengen}</p>
            </section>

            <section>
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                Schwimmart
              </h2>
              <div className="flex flex-wrap gap-2">
                {SCHWIMMARTEN.map(({ wert, label }) => (
                  <Auswahl
                    key={wert}
                    aktiv={konfiguration.schwimmart === wert}
                    onClick={() => setKonfiguration({ ...konfiguration, schwimmart: wert })}
                  >
                    {label}
                  </Auswahl>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {schritt === 2 ? (
          <div className="space-y-6">
            <section>
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                Bahnen
              </h2>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Weniger Bahnen"
                  onClick={() => setBahnen((aktuell) => Math.max(1, aktuell - 1))}
                  className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold"
                >
                  −
                </button>
                <span className="tabular w-10 text-center text-2xl font-semibold">{bahnen}</span>
                <button
                  type="button"
                  aria-label="Mehr Bahnen"
                  onClick={() => setBahnen((aktuell) => Math.min(10, aktuell + 1))}
                  className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold"
                >
                  +
                </button>
              </div>
            </section>

            <section>
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                Schwimmer
              </h2>
              <p className="mb-3 text-xs text-muted">
                Namen sind optional. Du kannst sie später im Tab „Schwimmer“ ergänzen.
              </p>
              <div className="space-y-2">
                {Array.from({ length: bahnen }, (_, index) => (
                  <label key={index} className="flex items-center gap-3">
                    <span className="tabular w-6 text-sm text-muted">{index + 1}</span>
                    <input
                      value={namen[index] ?? ''}
                      onChange={(e) =>
                        setNamen((aktuell) =>
                          aktuell.map((wert, i) => (i === index ? e.target.value : wert)),
                        )
                      }
                      autoComplete="off"
                      maxLength={80}
                      placeholder="Name"
                      aria-label={`Schwimmer für Bahn ${index + 1}`}
                      className="h-11 flex-1 rounded-xl border border-line bg-surface2 px-3 text-sm"
                    />
                  </label>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </div>

      <div className="border-t border-line p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
        <div className="flex gap-2">
          {schritt > 0 ? (
            <button
              type="button"
              onClick={() => setSchritt((aktuell) => aktuell - 1)}
              className="h-14 flex-1 rounded-xl border border-line bg-surface2 text-sm font-semibold"
            >
              Zurück
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (schritt < 2) setSchritt((aktuell) => aktuell + 1)
              else abschliessen()
            }}
            className="h-14 flex-[2] rounded-xl bg-accent text-base font-bold text-accent-fg"
          >
            {schritt < 2 ? 'Weiter' : 'Los geht’s'}
          </button>
        </div>
        <button
          type="button"
          onClick={ueberspringen}
          className="mt-3 h-10 w-full text-xs font-medium text-muted"
        >
          Überspringen und Standardwerte verwenden
        </button>
      </div>
    </div>
  )
}
