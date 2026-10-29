import { useMemo, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { berechnePbs, pacePro100, pbDelta } from '../domain/analyse'
import { formatDelta, formatStrecke, formatTime } from '../domain/format'
import { finishMs, isFinished, laneStatus } from '../domain/lauf'
import { SCHWIMMARTEN } from '../domain/types'
import { csvDateiname, laeufeAlsCsv } from '../export/csv'
import { speichereDatei } from '../export/datei'
import { Bestaetigung } from './Bestaetigung'
import { ChevronLeftIcon, DownloadIcon, TrashIcon } from './icons'

const datumFormat = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const zeitFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

export function LaufDetail({ laufId, onClose }: { laufId: string; onClose: () => void }) {
  const app = useApp()
  const lauf = app.laeufe.find((l) => l.id === laufId) ?? null
  const [frageLoeschen, setFrageLoeschen] = useState(false)

  const pbs = useMemo(() => berechnePbs(app.laeufe), [app.laeufe])

  if (!lauf) {
    return (
      <div className="fixed inset-0 z-30 grid place-items-center bg-bg">
        <button type="button" onClick={onClose} className="text-accent">
          Zurück
        </button>
      </div>
    )
  }

  const art = SCHWIMMARTEN.find((s) => s.wert === lauf.konfiguration.schwimmart)?.label ?? ''

  const exportiere = () => {
    const csv = laeufeAlsCsv([lauf], app.satze, app.schwimmer)
    void speichereDatei(csvDateiname(), csv, 'text/csv;charset=utf-8')
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-bg">
      <header className="flex items-center gap-1 border-b border-line px-2 py-2">
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 items-center gap-1 rounded-xl px-2 text-sm font-medium text-accent"
        >
          <ChevronLeftIcon className="h-5 w-5" />
          Verlauf
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={exportiere}
          aria-label="Als CSV exportieren"
          className="grid h-10 w-10 place-items-center rounded-xl text-muted"
        >
          <DownloadIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setFrageLoeschen(true)}
          aria-label="Lauf löschen"
          className="grid h-10 w-10 place-items-center rounded-xl text-muted"
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-8 pt-4">
        <p className="text-xs text-muted">
          {lauf.startWallMs ? `${datumFormat.format(lauf.startWallMs)} · ` : ''}
          {lauf.startWallMs ? `${zeitFormat.format(lauf.startWallMs)} Uhr` : 'ohne Startzeit'}
        </p>
        <h1 className="mt-1 text-xl font-semibold">
          {lauf.bahnen.length} Bahnen · {formatStrecke(lauf.konfiguration.streckeM)}
        </h1>
        <p className="text-sm text-muted">
          {lauf.konfiguration.beckenlaengeM} m-Becken · {art}
        </p>

        {!lauf.bahnen.every(isFinished) ? (
          <p className="mt-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
            Dieser Lauf ist unvollständig und zählt nicht als Bestzeit.
          </p>
        ) : null}

        <ul className="mt-4 space-y-2">
          {lauf.bahnen.map((bahn) => {
            const ms = finishMs(bahn)
            const delta = pbDelta(pbs, lauf, bahn)
            const status = laneStatus(bahn)
            return (
              <li key={bahn.id} className="rounded-2xl border border-line bg-surface p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="tabular text-sm text-muted">{bahn.nummer}</span>
                      <select
                        value={bahn.schwimmerId ?? ''}
                        onChange={(e) =>
                          app.setzeSchwimmerImLauf(lauf.id, bahn.id, e.target.value || null)
                        }
                        aria-label={`Schwimmer für Bahn ${bahn.nummer}`}
                        className="max-w-[11rem] truncate rounded-lg bg-transparent py-1 text-sm font-semibold"
                      >
                        <option value="">Schwimmer wählen</option>
                        {app.schwimmer.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {delta ? (
                      <p
                        className={`text-xs ${delta.istPb ? 'text-ok' : delta.deltaMs <= 0 ? 'text-ok' : 'text-muted'}`}
                      >
                        {delta.istPb
                          ? 'Bestzeit'
                          : `${formatDelta(delta.deltaMs)} zum PB`}
                      </p>
                    ) : null}
                  </div>
                  <p
                    className={`tabular shrink-0 text-2xl font-semibold ${ms === null ? 'text-muted' : 'text-fg'}`}
                  >
                    {ms === null ? '—' : formatTime(ms)}
                  </p>
                </div>

                {bahn.anschlaege.length > 1 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {bahn.anschlaege.map((anschlag) => (
                      <span
                        key={anschlag.laengeNr}
                        className={`tabular rounded-md px-2 py-1 text-[11px] ${
                          anschlag.istFinish
                            ? 'bg-ok/15 text-ok'
                            : 'bg-surface2 text-muted'
                        }`}
                      >
                        {anschlag.laengeNr * lauf.konfiguration.beckenlaengeM} m ·{' '}
                        {formatTime(anschlag.splitMs)}
                      </span>
                    ))}
                  </div>
                ) : null}

                {ms !== null && lauf.konfiguration.streckeM ? (
                  <p className="tabular mt-2 text-[11px] text-muted">
                    Pace {formatTime(pacePro100(ms, lauf.konfiguration.streckeM))} / 100 m
                    {status === 'beendet' ? '' : ' · unvollständig'}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      </div>

      <Bestaetigung
        open={frageLoeschen}
        titel="Lauf löschen?"
        text="Der Lauf und alle zugehörigen Zeiten werden dauerhaft entfernt."
        bestaetigenLabel="Löschen"
        onBestaetigen={() => {
          setFrageLoeschen(false)
          app.loescheLauf(lauf.id)
          onClose()
        }}
        onAbbrechen={() => setFrageLoeschen(false)}
      />
    </div>
  )
}
