import { useMemo, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { berechnePbs, pacePro100, pbDelta } from '../domain/analyse'
import { formatDelta, formatStrecke, formatTime, parseTime } from '../domain/format'
import { finishMs, isFinished, laneStatus, pruefeAnschlagKorrektur } from '../domain/lauf'
import { SCHWIMMARTEN } from '../domain/types'
import { csvDateiname, laeufeAlsCsv } from '../export/csv'
import { speichereDatei } from '../export/datei'
import { Bestaetigung } from './Bestaetigung'
import { ChevronLeftIcon, DownloadIcon, PencilIcon, TrashIcon } from './icons'

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
  const [bearbeitung, setBearbeitung] = useState<{
    bahnId: string
    laengeNr: number
    wert: string
  } | null>(null)
  const [korrekturFehler, setKorrekturFehler] = useState<string | null>(null)

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
            const finishAnschlag = bahn.anschlaege.find((a) => a.istFinish)
            const finishManuell = finishAnschlag?.manuell === true
            const bearbeitet =
              bearbeitung?.bahnId === bahn.id ? bearbeitung.laengeNr : null
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
                        className="max-w-[11rem] truncate rounded-lg bg-surface2 px-1 py-1 text-sm font-semibold"
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
                          ? `Bestzeit${finishManuell ? ' · manuell korrigiert' : ''}`
                          : `${formatDelta(delta.deltaMs)} zum PB${finishManuell ? ' · korrigiert' : ''}`}
                      </p>
                    ) : null}
                    {delta === null && finishManuell ? (
                      <p className="text-xs text-warn">manuell korrigiert</p>
                    ) : null}
                  </div>
                  <p
                    className={`tabular shrink-0 text-2xl font-semibold ${ms === null ? 'text-muted' : 'text-fg'}`}
                  >
                    {ms === null ? '—' : formatTime(ms)}
                  </p>
                </div>

                {bahn.anschlaege.length > 0 ? (
                  <ul className="mt-2 space-y-1 border-t border-line pt-2">
                    {bahn.anschlaege.map((anschlag) => {
                      const aktiv = bearbeitet === anschlag.laengeNr
                      return (
                        <li key={anschlag.laengeNr} className="flex items-center gap-2 text-[11px]">
                          <span className="tabular w-14 shrink-0 text-muted">
                            {anschlag.laengeNr * lauf.konfiguration.beckenlaengeM} m
                          </span>
                          {aktiv && bearbeitung ? (
                            <form
                              className="flex min-w-0 flex-1 items-center gap-1"
                              onSubmit={(e) => {
                                e.preventDefault()
                                const msWert = parseTime(bearbeitung.wert)
                                if (msWert === null) {
                                  setKorrekturFehler('Bitte eine Zeit wie 01:23,45 eingeben.')
                                  return
                                }
                                const fehler = pruefeAnschlagKorrektur(
                                  lauf,
                                  bahn.id,
                                  anschlag.laengeNr,
                                  msWert,
                                )
                                if (fehler) {
                                  setKorrekturFehler(fehler)
                                  return
                                }
                                app.korrigiereAnschlag(
                                  lauf.id,
                                  bahn.id,
                                  anschlag.laengeNr,
                                  msWert,
                                )
                                setBearbeitung(null)
                                setKorrekturFehler(null)
                              }}
                            >
                              <input
                                autoFocus
                                value={bearbeitung.wert}
                                onChange={(e) =>
                                  setBearbeitung({ ...bearbeitung, wert: e.target.value })
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    setBearbeitung(null)
                                    setKorrekturFehler(null)
                                  }
                                }}
                                inputMode="decimal"
                                aria-label={`Zeit für Länge ${anschlag.laengeNr}`}
                                className="tabular h-8 min-w-0 flex-1 rounded-md border border-line bg-surface2 px-2"
                              />
                              <button
                                type="submit"
                                className="h-8 rounded-md bg-accent px-2 font-bold text-accent-fg"
                              >
                                OK
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setBearbeitung(null)
                                  setKorrekturFehler(null)
                                }}
                                className="h-8 rounded-md px-2 text-muted"
                              >
                                Abbrechen
                              </button>
                            </form>
                          ) : (
                            <>
                              <span className="tabular flex-1">
                                {formatTime(anschlag.splitMs)}
                              </span>
                              {anschlag.manuell ? (
                                <span className="rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-bold text-warn">
                                  manuell
                                </span>
                              ) : null}
                              {anschlag.istFinish ? (
                                <span className="rounded bg-ok/15 px-1.5 py-0.5 text-[10px] font-bold text-ok">
                                  Ziel
                                </span>
                              ) : null}
                              <button
                                type="button"
                                aria-label={`Anschlag ${anschlag.laengeNr} korrigieren`}
                                onClick={() => {
                                  setBearbeitung({
                                    bahnId: bahn.id,
                                    laengeNr: anschlag.laengeNr,
                                    wert: formatTime(anschlag.splitMs),
                                  })
                                  setKorrekturFehler(null)
                                }}
                                className="grid h-7 w-7 place-items-center rounded-md text-muted"
                              >
                                <PencilIcon className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                ) : null}

                {bearbeitet !== null && korrekturFehler ? (
                  <p role="alert" className="mt-1 text-[11px] text-danger">
                    {korrekturFehler}
                  </p>
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
