/**
 * Wettkampf-Tab: Wettkämpfe, Disziplinen, Heats und Zielzeiten.
 *
 * Die Ansicht ist eine kleine Navigation mit drei Ebenen: Liste der
 * Wettkämpfe, Disziplinen eines Wettkampfs, ein Heat mit seinen Bahnen. Ein
 * Wettkampf entsteht von Hand oder über den Meldelisten-Import; angelegte
 * Disziplinen sind Sätze mit `wettkampfId`, ihre Läufe die Heats. Gemessen wird
 * pro Bahn mit einem Tap als Ziel (`WettkampfLane`), Platz und Rückstand kommen
 * aus domain/wettkampf. Export schreibt die Ergebnisse als CSV.
 */
import { useMemo, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { useNow } from '../app/useNow'
import { useWakeLock } from '../app/useWakeLock'
import { formatTime } from '../domain/format'
import { einheitVon, formatBeckenlaenge } from '../domain/einheit'
import { finishMs, istBahnBeendet } from '../domain/lauf'
import { wettkampfErgebnis, wettkampfFortschritt } from '../domain/wettkampf'
import type { Lauf, Satz, WettkampfStatus } from '../domain/types'
import { wettkampfCsvDateiname, wettkampfErgebnisseAlsCsv } from '../export/csv'
import { speichereDatei } from '../export/datei'
import { Bestaetigung } from './Bestaetigung'
import {
  DisziplinSheet,
  NamenSheet,
  WettkampfAnlegenSheet,
  ZeitSheet,
} from './WettkampfSheets'
import { WettkampfImportSheet } from './WettkampfImport'
import { WettkampfLane } from './WettkampfLane'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  PlusIcon,
  TrashIcon,
  TrophyIcon,
} from './icons'

// Datum mit Jahr, weil ein Wettkampf auch länger zurückliegen kann.
const datumFormat = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/**
 * Kopfzeile aller drei Ebenen: Zurückpfeil, Titel mit Untertitel und
 * rechts die Aktionen der aktuellen Ebene.
 */
function Kopf({
  titel,
  untertitel,
  onZurueck,
  aktionen,
}: {
  titel: string
  untertitel?: string
  onZurueck?: () => void
  aktionen?: React.ReactNode
}) {
  return (
    <header className="flex items-center gap-1 border-b border-line px-2 py-2 rail:px-4">
      {onZurueck ? (
        <button
          type="button"
          onClick={onZurueck}
          aria-label="Zurück"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold">{titel}</h1>
        {untertitel ? <p className="truncate text-[11px] text-muted">{untertitel}</p> : null}
      </div>
      {aktionen}
    </header>
  )
}

/** Leerzustand mit Pokal-Symbol für Ebenen ohne Einträge. */
function Leer({ titel, text }: { titel: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-surface text-muted">
        <TrophyIcon className="h-7 w-7" />
      </span>
      <p className="mt-4 text-sm font-semibold">{titel}</p>
      <p className="mt-2 max-w-xs text-xs leading-relaxed text-muted">{text}</p>
    </div>
  )
}

/**
 * Formatiert ein `YYYY-MM-DD`-Datum; mittags interpretiert, damit die Zeitzone
 * den Tag nicht verschiebt. Leere oder unlesbare Werte bleiben lesbar.
 */
function datumText(datum: string): string {
  if (!datum) return 'Ohne Datum'
  const parsed = new Date(`${datum}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? datum : datumFormat.format(parsed)
}

/**
 * Wettkampf-Tab mit Liste, Disziplinen und Heat-Ansicht.
 *
 * Die Auswahl liegt in drei IDs (`wettkampfId`, `satzId`, `laufId`); welche
 * Ebene gerendert wird, ergibt sich aus ihrer Belegung. Der Tab ist Leser und
 * Schreiber zugleich: Anlegen, Importieren, Starten, Tippen, Namen und
 * Zielzeiten laufen über `app`, die Anzeige von Platz und Rückstand über
 * domain/wettkampf. `useNow` und `useWakeLock` sind nur aktiv, solange
 * `app.brauchtTakt` gilt.
 */
export function WettkampfScreen() {
  const app = useApp()
  const [wettkampfId, setWettkampfId] = useState<string | null>(null)
  const [satzId, setSatzId] = useState<string | null>(null)
  const [laufId, setLaufId] = useState<string | null>(null)
  const [anlegenOpen, setAnlegenOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [disziplinOpen, setDisziplinOpen] = useState(false)
  const [namenOpen, setNamenOpen] = useState(false)
  // Ziel des Zeit-Sheets: Lauf und Bahn plus aktueller Wert für die Korrektur.
  const [zeitZiel, setZeitZiel] = useState<{
    laufId: string
    bahnId: string
    titel: string
    wert: number | null
    status: WettkampfStatus | null
  } | null>(null)
  // Eine Bestätigung für beide Löscharten; `art` entscheidet über den Text.
  const [loeschen, setLoeschen] = useState<{
    art: 'wettkampf' | 'disziplin'
    id: string
    name: string
  } | null>(null)

  // Nur die Heat-Ansicht zeigt eine laufende Uhr. Die Liste und die
  // Disziplinenansicht sollen nicht mit 60 fps neu rendern, nur weil
  // irgendwo ein Trainingslauf aktiv ist.
  const taktSichtbar = app.brauchtTakt && satzId !== null
  const now = useNow(taktSichtbar)
  useWakeLock(taktSichtbar)

  const wettkampf = app.wettkampfe.find((eintrag) => eintrag.id === wettkampfId) ?? null

  // Disziplinen sind Sätze des Wettkampfs, nach Anlage sortiert. `erstelltAm`
  // ist bewusst gestaffelt, damit die Reihenfolge der Meldeliste erhalten bleibt.
  const disziplinen = useMemo(
    () =>
      app.satze
        .filter((satz) => satz.wettkampfId === wettkampfId)
        .sort((a, b) => a.erstelltAm - b.erstelltAm),
    [app.satze, wettkampfId],
  )

  const satz = disziplinen.find((eintrag) => eintrag.id === satzId) ?? null

  // Heats eines Satzes, nach Wiederholungsnummer; ohne Nummer zählt 0.
  const laeufe = useMemo(
    () =>
      app.laeufe
        .filter((lauf) => lauf.satzId === satzId)
        .sort((a, b) => (a.wiederholung ?? 0) - (b.wiederholung ?? 0)),
    [app.laeufe, satzId],
  )

  // Ohne gültige Auswahl zeigt die Heat-Ansicht den ersten Lauf.
  const aktiverLauf = (laufId ? laeufe.find((lauf) => lauf.id === laufId) : null) ?? laeufe[0] ?? null

  const schwimmerName = (id: string | null) =>
    id ? (app.schwimmer.find((eintrag) => eintrag.id === id)?.name ?? null) : null

  /** Alle Läufe eines Wettkampfs über die IDs seiner Disziplinen. */
  const laeufeVonWettkampf = (id: string): Lauf[] => {
    const satzIds = new Set(
      app.satze.filter((eintrag) => eintrag.wettkampfId === id).map((eintrag) => eintrag.id),
    )
    return app.laeufe.filter((lauf) => lauf.satzId && satzIds.has(lauf.satzId))
  }

  /** Läufe einer Disziplin, sortiert wie in der Heat-Leiste. */
  const laeufeVonSatz = (id: string): Lauf[] =>
    app.laeufe
      .filter((lauf) => lauf.satzId === id)
      .sort((a, b) => (a.wiederholung ?? 0) - (b.wiederholung ?? 0))

  /**
   * Exportiert einen Wettkampf oder eine einzelne Disziplin als CSV.
   * Die Läufe werden über die Satz-IDs eingesammelt, damit nur Zugehöriges
   * in der Datei landet.
   */
  const exportiere = (filterSatz: Satz | null) => {
    if (!wettkampf) return
    const zuExportieren = filterSatz ? [filterSatz] : disziplinen
    const satzIds = new Set(zuExportieren.map((eintrag) => eintrag.id))
    const zugehoerigeLaeufe = app.laeufe.filter(
      (lauf) => lauf.satzId && satzIds.has(lauf.satzId),
    )
    const csv = wettkampfErgebnisseAlsCsv(
      wettkampf,
      zuExportieren,
      zugehoerigeLaeufe,
      app.schwimmer,
    )
    void speichereDatei(wettkampfCsvDateiname(wettkampf), csv, 'text/csv;charset=utf-8').catch(
      () => app.zeigeToast('Export fehlgeschlagen.'),
    )
  }

  /** Öffnet einen Wettkampf und setzt die unteren Ebenen zurück. */
  const oeffneWettkampf = (id: string) => {
    setWettkampfId(id)
    setSatzId(null)
    setLaufId(null)
  }

  /** Öffnet eine Disziplin direkt im ersten Heat. */
  const oeffneDisziplin = (eintrag: Satz) => {
    setSatzId(eintrag.id)
    setLaufId(laeufeVonSatz(eintrag.id)[0]?.id ?? null)
  }

  /** Eine Ebene zurück: erst vom Heat zur Disziplin, dann zur Liste. */
  const zurueck = () => {
    if (satzId) {
      setSatzId(null)
      setLaufId(null)
    } else if (wettkampfId) {
      setWettkampfId(null)
    }
  }

  // ---------- Wettkampfliste ----------

  if (!wettkampf) {
    return (
      <div className="flex h-full flex-col">
        <Kopf
          titel="Wettkampf"
          untertitel={`${app.wettkampfe.length} ${app.wettkampfe.length === 1 ? 'Wettkampf' : 'Wettkämpfe'}`}
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 rail:px-6">
          {app.wettkampfe.length === 0 ? (
            <Leer
              titel="Noch kein Wettkampf"
              text="Lege einen Wettkampf an oder importiere eine Meldeliste als CSV. Die Zeiten erfasst du danach direkt pro Bahn."
            />
          ) : (
            <ul className="grid grid-cols-1 gap-2 rail:grid-cols-2">
              {app.wettkampfe.map((eintrag) => {
                // Fortschritt und Disziplinzahl werden je Eintrag aus den
                // zugehörigen Sätzen und Läufen berechnet.
                const betroffeneLaeufe = laeufeVonWettkampf(eintrag.id)
                const fortschritt = wettkampfFortschritt(betroffeneLaeufe)
                const anzahlDisziplinen = app.satze.filter(
                  (satzEintrag) => satzEintrag.wettkampfId === eintrag.id,
                ).length
                return (
                  <li key={eintrag.id}>
                    <button
                      type="button"
                      onClick={() => oeffneWettkampf(eintrag.id)}
                      className="flex h-full w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold">{eintrag.name}</p>
                        <p className="text-xs text-muted">
                          {datumText(eintrag.datum)} ·{' '}
                          {formatBeckenlaenge(eintrag.beckenlaengeM, einheitVon(eintrag))}-Becken
                        </p>
                        <p className="tabular mt-2 text-xs text-muted">
                          {anzahlDisziplinen}{' '}
                          {anzahlDisziplinen === 1 ? 'Disziplin' : 'Disziplinen'} ·{' '}
                          {fortschritt.fertig}/{fortschritt.gesamt} entschieden
                        </p>
                      </div>
                      <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="space-y-2 border-t border-line p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] rail:px-4">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="h-14 w-full rounded-xl border border-accent/60 bg-accent/15 text-base font-bold text-accent"
          >
            Meldeliste importieren
          </button>
          <button
            type="button"
            onClick={() => setAnlegenOpen(true)}
            className="h-14 w-full rounded-xl bg-accent text-base font-bold text-accent-fg"
          >
            Neuer Wettkampf
          </button>
        </div>

        <WettkampfAnlegenSheet
          open={anlegenOpen}
          onClose={() => setAnlegenOpen(false)}
          onCreate={(daten) => {
            const id = app.erstelleWettkampf(daten)
            if (!id) return
            setAnlegenOpen(false)
            oeffneWettkampf(id)
            app.zeigeToast('Wettkampf angelegt.')
          }}
        />

        <WettkampfImportSheet
          open={importOpen}
          onClose={() => setImportOpen(false)}
          wettkampf={null}
          onImport={(plan, id) => {
            const neueId = app.importiereWettkampf(plan, id)
            if (!neueId) return
            setImportOpen(false)
            oeffneWettkampf(neueId)
            app.zeigeToast('Meldeliste übernommen.')
          }}
        />
      </div>
    )
  }

  // ---------- Disziplinen eines Wettkampfs ----------

  if (!satz) {
    const fortschritt = wettkampfFortschritt(laeufeVonWettkampf(wettkampf.id))
    return (
      <div className="flex h-full flex-col">
        <Kopf
          titel={wettkampf.name}
          untertitel={`${datumText(wettkampf.datum)} · ${formatBeckenlaenge(
            wettkampf.beckenlaengeM,
            einheitVon(wettkampf),
          )}-Becken`}
          onZurueck={zurueck}
          aktionen={
            <>
              <button
                type="button"
                onClick={() => exportiere(null)}
                aria-label="Ergebnisse als CSV exportieren"
                className="grid h-10 w-10 place-items-center rounded-xl text-muted"
              >
                <DownloadIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setLoeschen({ art: 'wettkampf', id: wettkampf.id, name: wettkampf.name })
                }
                aria-label="Wettkampf löschen"
                className="grid h-10 w-10 place-items-center rounded-xl text-muted"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            </>
          }
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 rail:px-6">
          {disziplinen.length === 0 ? (
            <Leer
              titel="Noch keine Disziplin"
              text="Importiere eine Meldeliste oder lege eine Disziplin mit Strecke, Schwimmart und Bahnen an."
            />
          ) : (
            <>
              <p className="tabular mb-2 px-1 text-xs text-muted">
                {fortschritt.fertig} von {fortschritt.gesamt} entschieden
              </p>
              <ul className="grid grid-cols-1 gap-2 rail:grid-cols-2">
                {disziplinen.map((eintrag) => {
                  // Je Disziplin zählen nur die eigenen Heats, nicht der ganze
                  // Wettkampf; die Summe steht darüber.
                  const betroffeneLaeufe = laeufeVonSatz(eintrag.id)
                  const disziplinFortschritt = wettkampfFortschritt(betroffeneLaeufe)
                  return (
                    <li key={eintrag.id}>
                      <button
                        type="button"
                        onClick={() => oeffneDisziplin(eintrag)}
                        className="flex h-full w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{eintrag.bezeichnung}</p>
                          <p className="tabular text-xs text-muted">
                            {betroffeneLaeufe.length}{' '}
                            {betroffeneLaeufe.length === 1 ? 'Lauf' : 'Läufe'} ·{' '}
                            {disziplinFortschritt.fertig}/{disziplinFortschritt.gesamt} entschieden
                          </p>
                        </div>
                        <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>

        <div className="space-y-2 border-t border-line p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] rail:px-4">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="h-12 w-full rounded-xl border border-line bg-surface2 text-sm font-bold"
          >
            Meldeliste hinzufügen
          </button>
          <button
            type="button"
            onClick={() => setDisziplinOpen(true)}
            className="flex h-14 w-full items-center justify-center gap-1.5 rounded-xl bg-accent text-base font-bold text-accent-fg"
          >
            <PlusIcon className="h-5 w-5" />
            Disziplin anlegen
          </button>
        </div>

        <DisziplinSheet
          open={disziplinOpen}
          onClose={() => setDisziplinOpen(false)}
          beckenlaengeM={wettkampf.beckenlaengeM}
          einheit={einheitVon(wettkampf)}
          onCreate={(daten) => {
            const id = app.erstelleWettkampfDisziplin(wettkampf.id, daten)
            if (!id) return
            setDisziplinOpen(false)
            setSatzId(id)
            setLaufId(null)
            app.zeigeToast('Disziplin angelegt.')
          }}
        />

        <WettkampfImportSheet
          open={importOpen}
          onClose={() => setImportOpen(false)}
          wettkampf={wettkampf}
          onImport={(plan, id) => {
            const neueId = app.importiereWettkampf(plan, id)
            if (!neueId) return
            setImportOpen(false)
            app.zeigeToast('Meldeliste hinzugefügt.')
          }}
        />

        <Bestaetigung
          open={loeschen?.art === 'wettkampf'}
          titel="Wettkampf löschen?"
          text={
            loeschen
              ? `„${loeschen.name}“ wird mit allen Disziplinen und Zeiten gelöscht. Das lässt sich nicht rückgängig machen.`
              : ''
          }
          bestaetigenLabel="Löschen"
          onBestaetigen={() => {
            if (loeschen) app.loescheWettkampf(loeschen.id)
            setLoeschen(null)
            setWettkampfId(null)
            setSatzId(null)
            setLaufId(null)
          }}
          onAbbrechen={() => setLoeschen(null)}
        />
      </div>
    )
  }

  // ---------- Ein Lauf einer Disziplin ----------

  const ergebnis = aktiverLauf ? wettkampfErgebnis(aktiverLauf) : []
  const fortschritt = aktiverLauf ? wettkampfFortschritt([aktiverLauf]) : { fertig: 0, gesamt: 0 }
  // Eine von Hand eingetragene Zielzeit beendet die Bahn, startet aber nicht
  // den ganzen Lauf. Der Startknopf bleibt für die übrigen Bahnen sichtbar.
  const gestartet = aktiverLauf?.bahnen.some((bahn) => bahn.startMs !== null) ?? false
  // `every` auf einer leeren Bahnliste wäre wahr; die Längenprüfung verhindert,
  // dass ein Lauf ohne Bahnen als beendet gilt.
  // Ein Heat ist beendet, sobald jede Bahn eine Zeit, DNS oder DNF hat.
  const alleFertig =
    !!aktiverLauf && aktiverLauf.bahnen.length > 0 && aktiverLauf.bahnen.every(istBahnBeendet)
  // Nächster Lauf innerhalb der Disziplin, sonst die nächste Disziplin; beides
  // ergibt sich aus der sortierten Liste.
  const naechsterLauf = aktiverLauf
    ? (laeufe[laeufe.findIndex((lauf) => lauf.id === aktiverLauf.id) + 1] ?? null)
    : null
  const naechsteDisziplin = disziplinen[disziplinen.findIndex((eintrag) => eintrag.id === satz.id) + 1] ?? null
  // Bahnen ohne Schwimmerzuordnung blockieren nicht den Start, werden aber
  // hervorgehoben, weil die Ergebnisliste sonst namenlos bleibt.
  const fehlendeNamen =
    aktiverLauf?.bahnen.filter((bahn) => !schwimmerName(bahn.schwimmerId)).length ?? 0
  // Startwerte für das Namen-Sheet; leere Bahnen bleiben leer.
  const startNamen = aktiverLauf
    ? aktiverLauf.bahnen.map((bahn) => schwimmerName(bahn.schwimmerId) ?? '')
    : []

  /** „Weiter“ nach dem letzten Ziel: nächster Heat, nächste Disziplin oder Liste. */
  const weiter = () => {
    if (naechsterLauf) {
      setLaufId(naechsterLauf.id)
      return
    }
    if (naechsteDisziplin) {
      oeffneDisziplin(naechsteDisziplin)
      return
    }
    setSatzId(null)
    setLaufId(null)
  }

  return (
    <div className="flex h-full flex-col">
      <Kopf
        titel={satz.bezeichnung}
        untertitel={`${wettkampf.name} · ${
          laeufe.length === 0
            ? 'Kein Lauf'
            : `Lauf ${aktiverLauf?.wiederholung ?? 1}/${laeufe.length}`
        }`}
        onZurueck={zurueck}
        aktionen={
          <>
            <button
              type="button"
              onClick={() => exportiere(satz)}
              aria-label="Disziplin als CSV exportieren"
              className="grid h-10 w-10 place-items-center rounded-xl text-muted"
            >
              <DownloadIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() =>
                setLoeschen({ art: 'disziplin', id: satz.id, name: satz.bezeichnung })
              }
              aria-label="Disziplin löschen"
              className="grid h-10 w-10 place-items-center rounded-xl text-muted"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </>
        }
      />

      <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-line px-2 py-2">
        {/* Heat-Leiste: ein Knopf pro Lauf mit eigenem Fortschritt. */}
        {laeufe.map((lauf) => {
          const laufFortschritt = wettkampfFortschritt([lauf])
          const aktiv = lauf.id === aktiverLauf?.id
          return (
            <button
              key={lauf.id}
              type="button"
              onClick={() => setLaufId(lauf.id)}
              aria-current={aktiv ? 'true' : undefined}
              className={`flex h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-semibold ${
                aktiv
                  ? 'border-accent bg-accent/15 text-fg'
                  : 'border-line bg-surface text-muted'
              }`}
            >
              Lauf {lauf.wiederholung ?? 1}
              <span className="tabular text-[10px] text-muted">
                {laufFortschritt.fertig}/{laufFortschritt.gesamt}
              </span>
            </button>
          )
        })}
      </div>

      {aktiverLauf ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-2 rail:p-4">
          <div className="grid grid-cols-1 gap-2 rail:grid-cols-2 rail:gap-3">
            {[...aktiverLauf.bahnen]
              // Bahnreihenfolge unabhängig von der Speicherreihenfolge.
              .sort((a, b) => a.nummer - b.nummer)
              .map((bahn) => {
                // Ergebniszeile liefert Platz, Rückstand und die
                // Manuell-Markierung; offene Bahnen haben keine Zeile.
                const zeile = ergebnis.find((eintrag) => eintrag.bahn.id === bahn.id)
                return (
                  <WettkampfLane
                    key={bahn.id}
                    bahn={bahn}
                    name={schwimmerName(bahn.schwimmerId)}
                    now={now}
                    platz={zeile?.platz ?? null}
                    rueckstandMs={zeile?.rueckstandMs ?? null}
                    manuell={zeile?.manuell ?? false}
                    status={bahn.status ?? null}
                    onTap={(bahnId, perf, wall) =>
                      app.tippeWettkampf(aktiverLauf.id, bahnId, perf, wall)
                    }
                    onUndo={(bahnId) => app.rueckgaengigWettkampf(aktiverLauf.id, bahnId)}
                    onZeit={(betroffeneBahn) =>
                      setZeitZiel({
                        laufId: aktiverLauf.id,
                        bahnId: betroffeneBahn.id,
                        titel: `Zielzeit · ${schwimmerName(betroffeneBahn.schwimmerId) ?? `Bahn ${betroffeneBahn.nummer}`}`,
                        wert: finishMs(betroffeneBahn),
                        status: betroffeneBahn.status ?? null,
                      })
                    }
                  />
                )
              })}
          </div>
        </div>
      ) : (
        <Leer
          titel="Kein Lauf"
          text="Diese Disziplin hat noch keinen Lauf. Lege sie neu an oder ergänze eine Meldeliste."
        />
      )}

      <div className="border-t border-line p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] rail:px-4">
        <div className="mx-auto w-full max-w-3xl">
        {/* Die Fußleiste hat drei Zustände: kein Lauf, noch nicht gestartet
            (Start) und laufend (Fortschritt plus Weiterschalter). */}
        {!aktiverLauf ? null : alleFertig ? (
          <div className="space-y-2">
            <p className="text-center text-xs font-semibold text-ok">
              Lauf beendet · {fortschritt.fertig} von {fortschritt.gesamt} entschieden
              {/* Erster Eintrag der Ergebnisliste ist der Sieger; ohne Zeit
                  (noch offene Bahn) entfällt der Zusatz. */}
              {ergebnis[0]?.zeitMs !== null && ergebnis[0]?.zeitMs !== undefined
                ? ` · Sieger ${formatTime(ergebnis[0].zeitMs)}`
                : ''}
            </p>
            <button
              type="button"
              onClick={weiter}
              className="h-16 w-full rounded-2xl bg-accent text-lg font-bold text-accent-fg shadow-lg active:scale-[0.99]"
            >
              {naechsterLauf
                ? 'Nächster Lauf'
                : naechsteDisziplin
                  ? 'Nächste Disziplin'
                  : 'Zurück zum Wettkampf'}
            </button>
            {fehlendeNamen > 0 ? (
              <button
                type="button"
                onClick={() => setNamenOpen(true)}
                className="h-10 w-full text-xs font-semibold text-accent"
              >
                {fehlendeNamen === 1
                  ? '1 Bahn ohne Namen · Namen eintragen'
                  : `${fehlendeNamen} Bahnen ohne Namen · Namen eintragen`}
              </button>
            ) : null}
          </div>
        ) : !gestartet ? (
          <div className="space-y-2">
            {fehlendeNamen > 0 ? (
              <button
                type="button"
                onClick={() => setNamenOpen(true)}
                className="h-10 w-full text-xs font-semibold text-accent"
              >
                {fehlendeNamen === 1
                  ? '1 Bahn ohne Namen · Namen eintragen'
                  : `${fehlendeNamen} Bahnen ohne Namen · Namen eintragen`}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() =>
                app.starteWettkampfLauf(aktiverLauf.id, performance.now(), Date.now())
              }
              className="h-20 w-full rounded-2xl bg-accent text-2xl font-bold text-accent-fg shadow-lg active:scale-[0.99]"
            >
              Start
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="tabular text-sm font-semibold">
                {fortschritt.fertig} von {fortschritt.gesamt} entschieden
              </p>
              <p className="text-xs text-muted">
                Tippe eine Bahn, sobald sie anschlägt. Langes Drücken nimmt zurück.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              {naechsterLauf ? (
                <button
                  type="button"
                  onClick={() => setLaufId(naechsterLauf.id)}
                  className="h-10 rounded-xl border border-line bg-surface2 px-3 text-xs font-semibold"
                >
                  Nächster Lauf
                </button>
              ) : null}
              {fehlendeNamen > 0 ? (
                <button
                  type="button"
                  onClick={() => setNamenOpen(true)}
                  className="h-10 rounded-xl border border-line bg-surface2 px-3 text-xs font-semibold"
                >
                  Namen
                </button>
              ) : null}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Namen nachträglich eintragen: Der AppProvider legt unbekannte Namen
          als Schwimmer an und leert die Zuordnung bei leeren Feldern. */}
      <NamenSheet
        open={namenOpen}
        onClose={() => setNamenOpen(false)}
        lauf={aktiverLauf}
        startNamen={startNamen}
        onSave={(namen) => {
          if (!aktiverLauf) return
          app.setzeWettkampfNamen(aktiverLauf.id, namen)
          setNamenOpen(false)
          app.zeigeToast('Namen gespeichert.')
        }}
      />

      {/* Von Hand eingetragene oder korrigierte Zielzeit; `wert` ist der
          aktuelle Zielanschlag der Bahn oder `null`. */}
      <ZeitSheet
        open={zeitZiel !== null}
        onClose={() => setZeitZiel(null)}
        titel={zeitZiel?.titel ?? 'Zielzeit'}
        wert={zeitZiel?.wert ?? null}
        status={zeitZiel?.status ?? null}
        onStatus={(status) => {
          if (!zeitZiel) return
          app.setzeWettkampfStatus(zeitZiel.laufId, zeitZiel.bahnId, status)
          setZeitZiel(null)
        }}
        onSave={(ms) => {
          if (!zeitZiel) return
          app.setzeWettkampfZeit(zeitZiel.laufId, zeitZiel.bahnId, ms)
          setZeitZiel(null)
        }}
      />

      <Bestaetigung
        open={loeschen?.art === 'disziplin'}
        titel="Disziplin löschen?"
        text={
          loeschen
            ? `„${loeschen.name}“ wird mit allen Läufen und Zeiten gelöscht. Das lässt sich nicht rückgängig machen.`
            : ''
        }
        bestaetigenLabel="Löschen"
        onBestaetigen={() => {
          if (loeschen) app.loescheSatz(loeschen.id)
          setLoeschen(null)
          setSatzId(null)
          setLaufId(null)
        }}
        onAbbrechen={() => setLoeschen(null)}
      />
    </div>
  )
}
