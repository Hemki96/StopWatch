/**
 * Vollbild-Detail eines Laufs im Verlauf.
 *
 * Zeigt Kopfzeile, Schwimmer je Bahn, alle Anschläge mit Splits, Bestzeit-Delta
 * und Pace. Anschläge lassen sich nachträglich korrigieren (markiert als
 * „manuell“), Schwimmer lassen sich zuordnen, der Lauf exportiert oder gelöscht
 * werden. Korrekturprüfung und Auswertung liegen in domain/lauf und
 * domain/analyse, die Aktionen im App-Kontext.
 */
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { berechnePbs, pacePro100, pbDelta } from '../domain/analyse'
import { formatDelta, formatStrecke, formatTakt, formatTime, parseTime } from '../domain/format'
import {
  finishMs,
  hatBegonnen,
  isFinished,
  laneStatus,
  pruefeAnschlagKorrektur,
  reihenVon,
} from '../domain/lauf'
import { SCHWIMMARTEN } from '../domain/types'
import { csvDateiname, laeufeAlsCsv } from '../export/csv'
import { speichereDatei } from '../export/datei'
import { Bestaetigung } from './Bestaetigung'
import { ChevronLeftIcon, DownloadIcon, PencilIcon, TrashIcon } from './icons'

/** Tagesdatum des Laufs in der Kopfzeile, deutsch und kurz. */
const datumFormat = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/** Uhrzeit des Starts; Sekunden stehen bereits in den Splits. */
const zeitFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

/**
 * Detailansicht eines gespeicherten Laufs. Der Lauf wird über die Id aus dem
 * App-Kontext gelesen, damit Korrekturen sofort in der Ansicht erscheinen.
 */
export function LaufDetail({
  laufId,
  onClose,
  zurueck = { label: 'Verlauf', aria: 'Zurück zum Verlauf' },
}: {
  laufId: string
  onClose: () => void
  /** Beschriftung und Vorlesetext des Rückwegs; der Schwimmer-Tab öffnet es mit. */
  zurueck?: { label: string; aria: string }
}) {
  const app = useApp()
  // Der Lauf wird bei jedem Render frisch im App-Kontext gesucht, damit
  // Korrekturen sofort ankommen; fehlt er, wurde er inzwischen gelöscht.
  const lauf = app.laeufe.find((l) => l.id === laufId) ?? null
  const [frageLoeschen, setFrageLoeschen] = useState(false)
  // Welcher Anschlag welcher Bahn gerade im Eingabefeld steht.
  const [bearbeitung, setBearbeitung] = useState<{
    bahnId: string
    laengeNr: number
    wert: string
  } | null>(null)
  // Fehlertext der Korrektur; gilt nur für den gerade bearbeiteten Anschlag.
  const [korrekturFehler, setKorrekturFehler] = useState<string | null>(null)

  // Bestzeiten über alle Läufe, nicht nur diesen: Das Delta ist der Vergleich
  // mit dem, was der Schwimmer bisher geschwommen ist.
  const pbs = useMemo(() => berechnePbs(app.laeufe), [app.laeufe])

  useEffect(() => {
    const beiTaste = (event: KeyboardEvent) => {
      // Ein offener Bestätigungsdialog stoppt die Ausbreitung selbst.
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', beiTaste)
    return () => window.removeEventListener('keydown', beiTaste)
  }, [onClose])

  // Der Lauf kann zwischen Öffnen und Rendern gelöscht worden sein; dann bleibt
  // nur der Weg zurück, statt eine leere Detailseite zu zeigen.
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
  const satz = app.satze.find((eintrag) => eintrag.id === lauf.satzId) ?? null
  // Unbegonnene Läufe und unvollständige Läufe werden unterschiedlich erklärt:
  // Der erste Fall hat noch keine Zeiten, der zweite zählt nicht als Bestzeit.
  const begonnen = hatBegonnen(lauf)

  // Ein einzelner Lauf als CSV, gleiche Spalten wie der Verlaufsexport.
  const exportiere = () => {
    const csv = laeufeAlsCsv([lauf], app.satze, app.schwimmer)
    // Ein fehlgeschlagener Export soll nicht stumm bleiben.
    void speichereDatei(csvDateiname(), csv, 'text/csv;charset=utf-8').catch(() =>
      app.zeigeToast('Export fehlgeschlagen.'),
    )
  }

  return (
    <div className="safe-x fixed inset-0 z-30 flex flex-col bg-bg">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-1 px-2 py-2 rail:px-4">
        {/* Kopfzeile: zurück zum Verlauf, CSV-Export und Löschen. Die
            Icon-Knöpfe tragen ein aria-label, weil das Symbol allein nichts
            vorlesbares enthält. */}
        <button
          type="button"
          onClick={onClose}
          aria-label={zurueck.aria}
          className="flex h-10 items-center gap-1 rounded-xl px-2 text-sm font-medium text-accent"
        >
          <ChevronLeftIcon className="h-5 w-5" />
          {zurueck.label}
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
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-4 pb-8 pt-4 rail:px-6">
        {/* Startzeit aus der Wanduhr, damit sie mit dem Verlauf und anderen
            Geräten vergleichbar bleibt. */}
        <p className="text-xs text-muted">
          {lauf.startWallMs ? `${datumFormat.format(lauf.startWallMs)} · ` : ''}
          {lauf.startWallMs ? `${zeitFormat.format(lauf.startWallMs)} Uhr` : 'ohne Startzeit'}
        </p>
        <h1 className="mt-1 text-xl font-semibold">
          {lauf.bahnen.length} {reihenVon(lauf) > 1 ? 'Personen' : 'Bahnen'} ·{' '}
          {formatStrecke(lauf.konfiguration.streckeM)}
        </h1>
        <p className="text-sm text-muted">
          {lauf.konfiguration.beckenlaengeM} m-Becken · {art}
          {reihenVon(lauf) > 1 ? ` · ${reihenVon(lauf)} Reihen` : ''}
          {lauf.startversatzMs > 0 && reihenVon(lauf) > 1
            ? ` · ${lauf.startversatzMs / 1000} s Reihenversatz`
            : ''}
        </p>
        {/* Im Wettkampf ist `wiederholung` die Laufnummer (Heat), in einer
            Serie die Runde. Der Text unterscheidet beides. */}
        {lauf.wiederholung ? (
          <p className="mt-1 text-xs font-semibold text-accent">
            {lauf.modus === 'wettkampf' ? 'Lauf' : 'Runde'} {lauf.wiederholung}
            {satz?.plan ? ` von ${satz.plan.wiederholungen} · Takt ${formatTakt(satz.plan.taktSek)}` : ''}
          </p>
        ) : null}

        {/* Zwei verschiedene Hinweise: noch gar nicht gestartet oder gestartet,
            aber nicht auf allen Bahnen im Ziel. */}
        {!begonnen ? (
          <p className="mt-3 rounded-xl border border-line bg-surface2 px-3 py-2 text-xs text-muted">
            Diese Runde hat noch nicht begonnen.
          </p>
        ) : !lauf.bahnen.every(isFinished) ? (
          <p className="mt-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
            Dieser Lauf ist unvollständig und zählt nicht als Bestzeit.
          </p>
        ) : null}

        <ul className="mt-4 grid grid-cols-1 items-start gap-2 rail:grid-cols-2">
          {lauf.bahnen.map((bahn) => {
            // Anzeigewerte pro Bahn: Zielzeit, Delta zur Bestzeit, Status und
            // ob der Zielanschlag von Hand gesetzt wurde.
            const ms = finishMs(bahn)
            const delta = pbDelta(pbs, lauf, bahn)
            const status = laneStatus(bahn)
            const finishAnschlag = bahn.anschlaege.find((a) => a.istFinish)
            const finishManuell = finishAnschlag?.manuell === true
            // Nur die Zeile des gerade bearbeiteten Anschlags wird zum Formular.
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
                        aria-label={`Schwimmer für Reihe ${bahn.reihe}, Bahn ${bahn.nummer}`}
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
                    {/* Delta zur Bestzeit: `deltaMs` ist positiv, wenn die Zeit
                        langsamer als das PB ist. Ist die Zeit selbst die
                        Bestzeit, steht das dort; eine manuelle Zielzeit wird
                        immer mitgenannt. */}
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
                          {/* Im Wettkampf gibt es nur den Zielanschlag; sonst
                              steht hier die kumulierte Strecke der Länge. */}
                          <span className="tabular w-14 shrink-0 text-muted">
                            {lauf.modus === 'wettkampf'
                              ? 'Ziel'
                              : `${anschlag.laengeNr * lauf.konfiguration.beckenlaengeM} m`}
                          </span>
                          {/*
                            Korrektur: Erst die Eingabe parsen, dann die
                            Reihenfolge der Splits prüfen. Die Prüfung liegt in
                            domain/lauf; ohne sie könnte ein Tippfehler die
                            Splits in falscher Reihenfolge hinterlassen.
                          */}
                          {aktiv && bearbeitung ? (
                            <form
                              className="flex min-w-0 flex-1 items-center gap-1"
                              onSubmit={(e) => {
                                e.preventDefault()
                                const msWert = parseTime(bearbeitung.wert)
                                // Unlesbare Eingabe wird nicht als 0 gewertet.
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
                                  // Escape verwirft die Korrektur, ohne zu speichern.
                                  if (e.key === 'Escape') {
                                    setBearbeitung(null)
                                    setKorrekturFehler(null)
                                  }
                                }}
                                // Dezimaltastatur auf dem Handy für die Hundertstel.
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
                              {/* Handkorrekturen bleiben sichtbar, damit eine
                                  Bestzeit nicht unbemerkt von Hand entsteht. */}
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
                                  // Vorbelegung mit der bisherigen Zeit; der
                                  // Fehler des vorigen Versuchs wird gelöscht.
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

                {/* Fehler nur an der Zeile zeigen, die gerade bearbeitet wird;
                    sonst stünde die Meldung an mehreren Bahnen gleichzeitig. */}
                {bearbeitet !== null && korrekturFehler ? (
                  <p role="alert" className="mt-1 text-[11px] text-danger">
                    {korrekturFehler}
                  </p>
                ) : null}

                {/* Pace nur mit fester Strecke; bei offener Strecke fehlt der
                    Bezug. Ein noch laufender Lauf wird als unvollständig
                    gekennzeichnet. */}
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

      {/* Löschen entfernt den Lauf endgültig; nach dem Bestätigen schließt die
          Detailansicht, weil ihr Lauf nicht mehr existiert. */}
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
