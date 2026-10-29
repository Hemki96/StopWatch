import { useMemo, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { isComplete } from '../domain/lauf'
import { schnellsteZeit } from '../domain/analyse'
import { formatStrecke, formatTime } from '../domain/format'
import { SCHWIMMARTEN, type Lauf } from '../domain/types'
import { Bestaetigung } from './Bestaetigung'
import { ChevronRightIcon, TrashIcon } from './icons'
import { LaufDetail } from './LaufDetail'

const datumFormat = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const uhrzeitFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

interface Gruppe {
  id: string
  datum: string
  titel: string
  laeufe: Lauf[]
}

export function HistoryScreen() {
  const app = useApp()
  const [offenerLauf, setOffenerLauf] = useState<string | null>(null)
  const [satzEdit, setSatzEdit] = useState<{ id: string; wert: string } | null>(null)
  const [satzLoeschen, setSatzLoeschen] = useState<{ id: string; anzahl: number } | null>(null)

  const speichereSatz = () => {
    if (!satzEdit) return
    app.benenneSatz(satzEdit.id, satzEdit.wert)
    setSatzEdit(null)
  }

  const gruppen = useMemo<Gruppe[]>(() => {
    const nachSatz = new Map<string, Lauf[]>()
    for (const lauf of app.laeufe) {
      const key = lauf.satzId ?? 'ohne-satz'
      const liste = nachSatz.get(key)
      if (liste) liste.push(lauf)
      else nachSatz.set(key, [lauf])
    }

    return [...nachSatz.entries()]
      .map(([id, laeufe]) => {
        const satz = app.satze.find((s) => s.id === id)
        const konfiguration = satz?.konfiguration ?? laeufe[0]?.konfiguration
        const art = konfiguration
          ? (SCHWIMMARTEN.find((s) => s.wert === konfiguration.schwimmart)?.label ?? '')
          : ''
        const titel =
          satz?.bezeichnung ||
          (konfiguration
            ? `${formatStrecke(konfiguration.streckeM)} · ${art}`
            : 'Ohne Satz')
        return {
          id,
          datum: satz?.datum ?? '',
          titel,
          laeufe: [...laeufe].sort(
            (a, b) => (b.startWallMs ?? 0) - (a.startWallMs ?? 0),
          ),
        }
      })
      .sort((a, b) => b.datum.localeCompare(a.datum) || b.id.localeCompare(a.id))
  }, [app.laeufe, app.satze])

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line px-4 py-3">
        <h1 className="text-lg font-semibold">Verlauf</h1>
        <p className="text-xs text-muted">
          {app.laeufe.length} {app.laeufe.length === 1 ? 'Lauf' : 'Läufe'}
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-8 pt-3">
        {gruppen.length === 0 ? (
          <p className="mt-16 text-center text-sm text-muted">
            Noch keine Messungen. Starte den ersten Lauf im Tab „Timer“.
          </p>
        ) : null}

        {gruppen.map((gruppe) => (
          <section key={gruppe.id} className="mb-6">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-muted">
                {gruppe.datum
                  ? datumFormat.format(new Date(`${gruppe.datum}T12:00:00`))
                  : 'Ohne Datum'}
              </h2>
              {satzEdit?.id === gruppe.id ? (
                <input
                  autoFocus
                  value={satzEdit.wert}
                  onChange={(e) => setSatzEdit({ id: gruppe.id, wert: e.target.value })}
                  onBlur={speichereSatz}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') speichereSatz()
                    if (e.key === 'Escape') setSatzEdit(null)
                  }}
                  aria-label="Satzbezeichnung"
                  className="min-w-0 flex-1 rounded-md border border-line bg-surface2 px-2 py-1 text-right text-xs"
                />
              ) : gruppe.id === 'ohne-satz' ? (
                <span className="truncate text-xs text-muted">{gruppe.titel}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setSatzEdit({ id: gruppe.id, wert: gruppe.titel })}
                  className="min-w-0 truncate text-xs text-muted underline decoration-dotted underline-offset-2"
                >
                  {gruppe.titel}
                </button>
              )}
              {gruppe.id === 'ohne-satz' ? null : (
                <button
                  type="button"
                  onClick={() =>
                    setSatzLoeschen({ id: gruppe.id, anzahl: gruppe.laeufe.length })
                  }
                  aria-label={`Satz löschen, ${gruppe.laeufe.length} Läufe`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>

            <ul className="space-y-2">
              {gruppe.laeufe.map((lauf) => {
                const schnellste = schnellsteZeit(lauf)
                const vollstaendig = isComplete(lauf)
                return (
                  <li key={lauf.id}>
                    <button
                      type="button"
                      onClick={() => setOffenerLauf(lauf.id)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">
                          {lauf.bahnen.length} Bahnen ·{' '}
                          {formatStrecke(lauf.konfiguration.streckeM)}
                          {!vollstaendig ? (
                            <span className="ml-2 rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-bold text-warn">
                              unvollständig
                            </span>
                          ) : null}
                        </p>
                        <p className="tabular text-xs text-muted">
                          {lauf.startWallMs
                            ? `${uhrzeitFormat.format(lauf.startWallMs)} Uhr`
                            : 'ohne Startzeit'}
                          {schnellste !== null ? ` · schnellste ${formatTime(schnellste)}` : ''}
                        </p>
                      </div>
                      <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      {offenerLauf ? (
        <LaufDetail laufId={offenerLauf} onClose={() => setOffenerLauf(null)} />
      ) : null}

      <Bestaetigung
        open={satzLoeschen !== null}
        titel="Satz löschen?"
        text={
          satzLoeschen
            ? `${satzLoeschen.anzahl} ${satzLoeschen.anzahl === 1 ? 'Lauf wird' : 'Läufe werden'} mitgelöscht. Das lässt sich nicht rückgängig machen.`
            : ''
        }
        bestaetigenLabel="Satz löschen"
        onBestaetigen={() => {
          if (satzLoeschen) app.loescheSatz(satzLoeschen.id)
          setSatzLoeschen(null)
        }}
        onAbbrechen={() => setSatzLoeschen(null)}
      />
    </div>
  )
}
