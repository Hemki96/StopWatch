/**
 * Training-Tab: Plan vorbereiten und Satz für Satz abarbeiten.
 *
 * Ohne gewähltes Training zeigt der Screen die Liste aller vorbereiteten
 * Trainings mit Fortschritt und ein „Neues Training“. Mit gewähltem Training
 * erscheinen Aktive, Fortschrittsbalken und die Sätze in fester Reihenfolge;
 * unten startet oder öffnet der nächste Satz. Die Zustände und Reihenfolge
 * kommen aus domain/training, die Schreibpfade aus app/AppProvider. Nur noch
 * nicht gestartete Sätze lassen sich ändern; gemessene Läufe bleiben erhalten.
 */
import { useState } from 'react'
import { useApp } from '../app/AppProvider'
import { entferneText, leseText, schreibeText } from '../app/lokalSpeicher'
import {
  MAX_TRAININGS_SAETZE,
  naechsterSatz,
  neuerTrainingsSatz,
  ohneTrainingsSatz,
  trainingsFortschritt,
  trainingsSatzMeta,
  trainingsSatzTitel,
  trainingZusammenfassung,
  verschiebeTrainingsSatz,
  type TrainingsSatzFortschritt,
  type TrainingsSatzStatus,
} from '../domain/training'
import type { Training, TrainingsSatz } from '../domain/types'
import { AktiveSheet } from './AktiveSheet'
import { Bestaetigung } from './Bestaetigung'
import { Schalter } from './Felder'
import { Sheet } from './Sheet'
import { Startuebersicht, StartuebersichtTraining } from './Startuebersicht'
import { TrainingsSatzSheet } from './TrainingsSatzSheet'
import { ChevronLeftIcon, PlusIcon, TrashIcon } from './icons'

// Gemerkt wird nur die Auswahl (Training), nicht der Bearbeitungszustand:
// Nach einem Neustart landet man wieder im zuletzt geöffneten Training. Der
// logische Schlüssel wird von `lokalSpeicher` namespaced; der frühere Schlüssel
// bleibt als Rückfall lesbar.
const AUSWAHL_KEY = 'training'

// Anzeigetexte und Farben je Satzstatus; die Statuswerte selbst kommen aus
// domain/training.
const STATUS_LABEL: Record<TrainingsSatzStatus, string> = {
  offen: 'offen',
  bereit: 'bereit',
  laeuft: 'läuft',
  fertig: 'fertig',
}

const STATUS_KLASSE: Record<TrainingsSatzStatus, string> = {
  offen: 'bg-surface2 text-muted',
  bereit: 'bg-accent/15 text-accent',
  laeuft: 'bg-accent/15 text-accent',
  fertig: 'bg-ok/15 text-ok',
}

// Wochentag und Tagesdatum reichen für die Liste; das Training ist an einem Tag.
const datumFormat = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
})

/** Liest die zuletzt gewählte Trainings-ID; ohne Speicher beginnt der Tab in der Liste. */
function leseAuswahl(): string | null {
  return leseText(AUSWAHL_KEY)
}

/** Merkt die Auswahl; `null` löscht den Eintrag und zeigt wieder die Liste. */
function merkeAuswahl(id: string | null): void {
  if (id) schreibeText(AUSWAHL_KEY, id)
  else entferneText(AUSWAHL_KEY)
}

/**
 * Formatiert ein `YYYY-MM-DD`-Datum. Mittagszeit vermeidet Zeitzonen-Sprünge;
 * ein unlesbares Datum wird unverändert angezeigt.
 */
function datumLabel(datum: string): string {
  const parsed = new Date(`${datum}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? datum : datumFormat.format(parsed)
}

/** Kurztext für den Fortschrittsbalken, mit korrektem Singular/Plural. */
function fortschrittText(fortschritt: TrainingsSatzFortschritt[]): string {
  const { fertig, gesamt } = trainingZusammenfassung(fortschritt)
  return `${fertig} von ${gesamt} ${gesamt === 1 ? 'Satz' : 'Sätzen'} erledigt`
}

interface TrainingScreenProps {
  /** Wechselt nach dem Start eines Satzes in den Timer-Tab. */
  onZumTimer: () => void
}

/**
 * Training-Tab mit Liste und Detailansicht.
 *
 * Ein Training wird über `app.anlegeTraining` erzeugt und lokal gemerkt.
 * Sätze lassen sich nur bearbeiten, solange sie „offen“ sind; „bereit“ und
 * „läuft“ führen zurück in den Timer. Gelöschte Trainings behalten ihre
 * bereits gemessenen Sätze und Läufe im Verlauf.
 */
export function TrainingScreen({ onZumTimer }: TrainingScreenProps) {
  const app = useApp()
  const [gewaehlt, setGewaehlt] = useState<string | null>(leseAuswahl)
  const [neuerSatz, setNeuerSatz] = useState<TrainingsSatz | null>(null)
  const [bearbeitet, setBearbeitet] = useState<string | null>(null)
  const [aktiveOffen, setAktiveOffen] = useState(false)
  const [umbenennen, setUmbenennen] = useState(false)
  const [frageLoeschen, setFrageLoeschen] = useState(false)
  // Startübersicht: ID des Trainingssatzes, dessen Uhr als Nächstes beginnt.
  // `null` heißt geschlossen; erst „Jetzt starten“ ruft `starte` auf.
  const [startPruefen, setStartPruefen] = useState<string | null>(null)

  // Eine gemerkte, inzwischen gelöschte ID fällt auf die Liste zurück.
  const training = app.trainings.find((eintrag) => eintrag.id === gewaehlt) ?? null

  /** Wechselt zwischen Liste und Detail und merkt die Wahl für den nächsten Start. */
  const waehle = (id: string | null) => {
    setGewaehlt(id)
    merkeAuswahl(id)
  }

  if (!training) {
    return (
      <div className="flex h-full flex-col">
        <header className="border-b border-line px-4 py-3 rail:px-6">
          <h1 className="text-lg font-semibold">Training</h1>
          <p className="text-xs text-muted">
            {app.trainings.length === 1
              ? '1 Training vorbereitet'
              : `${app.trainings.length} Trainings vorbereitet`}
          </p>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-8 pt-3 rail:px-6">
          {app.trainings.length === 0 ? (
            <div className="mt-16 px-4 text-center">
              <p className="text-sm font-semibold">Noch kein Training vorbereitet</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Lege vorab die Aktiven und die Sätze fest. Im Training startest du dann Satz für
                Satz und kannst noch nicht gestartete Sätze jederzeit ändern.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-2 rail:grid-cols-2">
              {app.trainings.map((eintrag) => {
                // Fortschritt je Training aus den bereits gestarteten Sätzen;
                // `aktive` zählt nur tatsächlich besetzte Bahnen.
                const fortschritt = trainingsFortschritt(eintrag, app.satze, app.laeufe)
                const { fertig, gesamt } = trainingZusammenfassung(fortschritt)
                const aktive = eintrag.aktive.filter(Boolean).length
                return (
                  <li key={eintrag.id}>
                    <button
                      type="button"
                      onClick={() => waehle(eintrag.id)}
                      className="h-full w-full rounded-2xl border border-line bg-surface p-4 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                          {datumLabel(eintrag.datum)}
                        </span>
                        {gesamt > 0 && fertig === gesamt ? (
                          // Ohne Sätze wäre `fertig === gesamt` ebenfalls wahr;
                          // die Längenprüfung verhindert die falsche Marke.
                          <span className="ml-auto rounded bg-ok/15 px-1.5 py-0.5 text-[10px] font-bold text-ok">
                            abgeschlossen
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-base font-semibold">
                        {eintrag.bezeichnung || 'Training'}
                      </p>
                      <p className="text-xs text-muted">
                        {gesamt} {gesamt === 1 ? 'Satz' : 'Sätze'} · {aktive}{' '}
                        {aktive === 1 ? 'Aktiver' : 'Aktive'} · {fertig}/{gesamt} erledigt
                      </p>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <button
            type="button"
            onClick={() => {
              const id = app.anlegeTraining()
              if (id) waehle(id)
            }}
            className="mt-4 h-14 w-full rounded-xl bg-accent text-base font-bold text-accent-fg"
          >
            Neues Training
          </button>

          <p className="mt-4 px-1 text-xs leading-relaxed text-muted">
            Ein Training ist ein Plan für eine Einheit: Aktive je Bahn und mehrere Sätze in fester
            Reihenfolge. Erst beim Start entstehen daraus messbare Läufe.
          </p>
        </div>
      </div>
    )
  }

  const fortschritt = trainingsFortschritt(training, app.satze, app.laeufe)
  // Der nächste Satz ist der laufende/bereite, sonst der erste offene.
  const naechster = naechsterSatz(fortschritt)
  /** Namen je Platz, Reihe für Reihe; leere Plätze bleiben `null`. */
  const namenProPlatz = training.aktive.map((id) =>
    id ? (app.schwimmer.find((eintrag) => eintrag.id === id)?.name ?? null) : null,
  )
  // Nur besetzte Aktive anzeigen; leere Bahnen bleiben in `training.aktive`.
  const namen = namenProPlatz.filter((name): name is string => Boolean(name))
  // Der Satz, dessen Startübersicht offen ist; eine gelöschte ID fällt weg.
  const startKandidat = startPruefen
    ? (fortschritt.find((eintrag) => eintrag.eintrag.id === startPruefen) ?? null)
    : null
  const bearbeiteterSatz = bearbeitet
    ? (training.saetze.find((eintrag) => eintrag.id === bearbeitet) ?? null)
    : null

  /** Einheitlicher Schreibpfad: Das ganze Training wird ersetzt gespeichert. */
  const speichere = (naechstes: Training) => app.speichereTraining(naechstes)

  /**
   * Fügt einen Satz hinzu oder ersetzt ihn an seiner bisherigen Position.
   * Ein unbekannter Satz (neu) wird hinten angehängt.
   */
  const aktualisiereSatz = (satz: TrainingsSatz) => {
    const index = training.saetze.findIndex((eintrag) => eintrag.id === satz.id)
    const saetze =
      index === -1
        ? [...training.saetze, satz]
        : training.saetze.map((eintrag) => (eintrag.id === satz.id ? satz : eintrag))
    speichere({ ...training, saetze })
    setBearbeitet(null)
    setNeuerSatz(null)
  }

  /** Löscht einen Satz; ein Training muss mindestens einen Satz behalten. */
  const entferneSatz = (satzId: string) => {
    if (training.saetze.length <= 1) {
      app.zeigeToast('Ein Training braucht mindestens einen Satz.')
      return
    }
    speichere(ohneTrainingsSatz(training, satzId))
    setBearbeitet(null)
  }

  /** Verschiebt einen Satz in der festen Reihenfolge um eine Position. */
  const verschiebe = (satzId: string, richtung: -1 | 1) => {
    speichere(verschiebeTrainingsSatz(training, satzId, richtung))
  }

  /**
   * Startet einen Trainingssatz: Dabei entstehen Satz und Läufe, der Trainer
   * wechselt in den Timer. Ein bereits gestarteter Satz wird nur ausgewählt.
   */
  const starte = (satzId: string) => {
    const laufId = app.starteTrainingsSatz(
      training.id,
      satzId,
      performance.now(),
      Date.now(),
    )
    if (laufId) onZumTimer()
  }

  /**
   * Ein Tipp auf eine Satzzeile: offene Sätze öffnen den Editor, fertige sind
   * gesperrt, ein angelegter Satz zeigt erst die Übersicht und ein laufender
   * führt zurück in die Messung.
   */
  const oeffneSatz = (eintrag: TrainingsSatzFortschritt) => {
    if (eintrag.status === 'offen') {
      setBearbeitet(eintrag.eintrag.id)
      return
    }
    if (eintrag.status === 'fertig') return
    if (eintrag.status === 'bereit') {
      setStartPruefen(eintrag.eintrag.id)
      return
    }
    starte(eintrag.eintrag.id)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-2 py-2 rail:px-6">
        <button
          type="button"
          onClick={() => waehle(null)}
          aria-label="Zurück zu den Trainings"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
            {datumLabel(training.datum)}
          </p>
          <button
            type="button"
            onClick={() => setUmbenennen(true)}
            className="block max-w-full truncate text-left text-base font-semibold"
          >
            {training.bezeichnung || 'Training'}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setFrageLoeschen(true)}
          aria-label="Training löschen"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted"
        >
          <TrashIcon className="h-5 w-5" />
        </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 pb-6 pt-4 rail:px-6">
        <button
          type="button"
          onClick={() => setAktiveOffen(true)}
          className="w-full rounded-2xl border border-line bg-surface p-4 text-left"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Aktive
            </span>
            <span className="text-xs font-medium text-accent">Ändern</span>
          </span>
          <span className="mt-1 block text-sm font-semibold">
            {training.reihen > 1
              ? `${training.bahnen * training.reihen} Personen in ${training.reihen} Reihen`
              : `${training.bahnen} ${training.bahnen === 1 ? 'Bahn' : 'Bahnen'}`}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted">
            {training.reihen > 1
              ? Array.from({ length: training.reihen }, (_, reiheIndex) => {
                  const namenDerReihe = training.aktive
                    .slice(
                      reiheIndex * training.bahnen,
                      (reiheIndex + 1) * training.bahnen,
                    )
                    .map((id) =>
                      id ? app.schwimmer.find((eintrag) => eintrag.id === id)?.name : null,
                    )
                    .filter((name): name is string => Boolean(name))
                  return `R${reiheIndex + 1}: ${namenDerReihe.join(', ') || '—'}`
                }).join(' · ')
              : namen.length > 0
                ? namen.join(', ')
                : 'Noch keine Aktiven gewählt'}
          </span>
        </button>

        <div className="mt-3 flex items-center gap-2 px-1">
          {/* Breite aus dem Anteil fertiger Sätze; ohne Sätze bleibt der Balken leer. */}
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
            <span
              className="block h-full rounded-full bg-ok transition-[width]"
              style={{
                width: `${fortschritt.length === 0 ? 0 : (trainingZusammenfassung(fortschritt).fertig / fortschritt.length) * 100}%`,
              }}
            />
          </span>
          <span className="tabular shrink-0 text-[11px] text-muted">
            {fortschrittText(fortschritt)}
          </span>
        </div>

        {/* Der automatische Wechsel gilt für die ganze Einheit. Er lässt sich
            jederzeit abschalten; bereits gestartete Sätze bleiben unberührt. */}
        <div className="mt-3">
          <Schalter
            an={training.autostart === true}
            onAendern={(an) => speichere({ ...training, autostart: an })}
            titel="Sätze automatisch starten"
            beschreibung="Nach dem letzten Ziel beginnt der nächste Satz direkt. Der vorige bleibt in der Leiste und im Verlauf."
          />
        </div>

        <h2 className="mb-2 mt-6 px-1 text-[11px] font-bold uppercase tracking-wider text-muted">
          Sätze
        </h2>
        <ol className="space-y-2">
          {fortschritt.map((eintrag) => {
            const titel = trainingsSatzTitel(eintrag.eintrag)
            // Fertige Sätze sind nur noch Anzeige; alles andere ist antippbar.
            const oeffnen = eintrag.status !== 'fertig'
            return (
              <li key={eintrag.eintrag.id}>
                <div
                  className={`flex items-stretch overflow-hidden rounded-2xl border ${
                    eintrag.status === 'laeuft' || eintrag.status === 'bereit'
                      ? 'border-accent/60 bg-accent/5'
                      : eintrag.status === 'fertig'
                        ? 'border-ok/40 bg-ok/5'
                        : 'border-line bg-surface'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => oeffneSatz(eintrag)}
                    disabled={!oeffnen}
                    aria-label={`Satz ${eintrag.index + 1}: ${titel}, ${STATUS_LABEL[eintrag.status]}`}
                    className="min-w-0 flex-1 p-3 text-left disabled:cursor-default"
                  >
                    <span className="flex items-center gap-2">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-surface2 text-[11px] font-bold text-muted">
                        {eintrag.index + 1}
                      </span>
                      <span className="truncate text-sm font-semibold">{titel}</span>
                      <span
                        className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${STATUS_KLASSE[eintrag.status]}`}
                      >
                        {STATUS_LABEL[eintrag.status]}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted">
                      {trainingsSatzMeta(eintrag.eintrag)}
                    </span>
                    {eintrag.status === 'laeuft' || eintrag.status === 'bereit' ? (
                      <span className="mt-1 block text-[11px] font-medium text-accent">
                        {eintrag.fertigeRunden} von {eintrag.laeufe.length}{' '}
                        {eintrag.laeufe.length === 1 ? 'Runde' : 'Runden'} vollständig · antippen
                        zum Weiterarbeiten
                      </span>
                    ) : eintrag.status === 'offen' ? (
                      <span className="mt-1 block text-[11px] text-muted">
                        Antippen zum Ändern
                      </span>
                    ) : null}
                  </button>
                </div>
              </li>
            )
          })}
        </ol>

        <button
          type="button"
          disabled={training.saetze.length >= MAX_TRAININGS_SAETZE}
          onClick={() => {
            // Neuer Satz als Kopie des letzten: Wiederholungen, Takt und
            // Konfiguration sind meist ähnlich. ID und Bezeichnung werden
            // zurückgesetzt, damit kein bestehender Satz überschrieben wird.
            const basis = training.saetze.at(-1) ?? neuerTrainingsSatz()
            const { id: _id, ...ohneId } = basis
            setNeuerSatz(
              neuerTrainingsSatz({
                ...ohneId,
                bezeichnung: '',
                konfiguration: { ...basis.konfiguration },
              }),
            )
          }}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface text-sm font-semibold text-muted disabled:opacity-40"
        >
          <PlusIcon className="h-4 w-4" />
          Satz hinzufügen
        </button>

        <p className="mt-4 px-1 text-xs leading-relaxed text-muted">
          Noch nicht gestartete Sätze lassen sich antippen und anpassen. Sobald ein Satz läuft,
          zählen die gemessenen Zeiten; der Plan bleibt für die nächsten Sätze änderbar.
        </p>
      </div>

      <div className="border-t border-line p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] rail:px-4">
        <div className="mx-auto w-full max-w-3xl">
        {/* Der Hauptknopf folgt dem nächsten Satz: starten, fortsetzen oder
            zurück in die laufende Messung; ohne nächsten Satz ist alles fertig. */}
        {naechster ? (
          <button
            type="button"
            onClick={() =>
              // Ein laufender Satz öffnet nur die Messung; alles, was die Uhr
              // startet oder fortsetzt, geht über die Startübersicht.
              naechster.status === 'laeuft'
                ? starte(naechster.eintrag.id)
                : setStartPruefen(naechster.eintrag.id)
            }
            className="h-16 w-full rounded-2xl bg-accent text-lg font-bold text-accent-fg shadow-lg active:scale-[0.99]"
          >
            {naechster.status === 'offen'
              ? `Satz ${naechster.index + 1} starten`
              : naechster.status === 'bereit'
                ? `Satz ${naechster.index + 1} fortsetzen`
                : 'Zum laufenden Satz'}
          </button>
        ) : (
          <div className="py-2 text-center">
            <p className="text-sm font-semibold text-ok">Training abgeschlossen</p>
            <p className="text-xs text-muted">Alle Sätze sind im Ziel.</p>
          </div>
        )}
        </div>
      </div>

      {bearbeiteterSatz ? (
        <TrainingsSatzSheet
          satz={bearbeiteterSatz}
          bahnen={training.bahnen}
          reihen={training.reihen}
          index={training.saetze.findIndex((eintrag) => eintrag.id === bearbeiteterSatz.id)}
          istNeu={false}
          kannNachOben={
            training.saetze.findIndex((eintrag) => eintrag.id === bearbeiteterSatz.id) > 0
          }
          kannNachUnten={
            training.saetze.findIndex((eintrag) => eintrag.id === bearbeiteterSatz.id) <
            training.saetze.length - 1
          }
          onClose={() => setBearbeitet(null)}
          onSpeichern={aktualisiereSatz}
          onLoeschen={() => entferneSatz(bearbeiteterSatz.id)}
          onVerschieben={(richtung) => verschiebe(bearbeiteterSatz.id, richtung)}
        />
      ) : null}

      {neuerSatz ? (
        <TrainingsSatzSheet
          satz={neuerSatz}
          bahnen={training.bahnen}
          reihen={training.reihen}
          index={training.saetze.length}
          istNeu
          kannNachOben={false}
          kannNachUnten={false}
          onClose={() => setNeuerSatz(null)}
          onSpeichern={aktualisiereSatz}
          onLoeschen={() => setNeuerSatz(null)}
          onVerschieben={() => undefined}
        />
      ) : null}

      {aktiveOffen ? (
        <AktiveSheet
          training={training}
          schwimmer={app.schwimmer}
          onClose={() => setAktiveOffen(false)}
          onSpeichern={(bahnen, reihen, aktive) => {
            // Die Zuordnung gilt nur für noch nicht gestartete Sätze; bereits
            // gestartete Sätze behalten ihre kopierten Bahnen.
            speichere({ ...training, bahnen, reihen, aktive })
            setAktiveOffen(false)
          }}
        />
      ) : null}

      {umbenennen ? (
        <UmbenennenSheet
          wert={training.bezeichnung}
          onClose={() => setUmbenennen(false)}
          onSpeichern={(bezeichnung) => {
            speichere({ ...training, bezeichnung: bezeichnung.trim() })
            setUmbenennen(false)
          }}
        />
      ) : null}

      {startKandidat ? (
        <Startuebersicht
          open
          titel="Training starten?"
          text={`Prüfe Aktive und Reihenfolge. Erst mit „Jetzt starten“ beginnt die Uhr für Satz ${startKandidat.index + 1}.`}
          startLabel="Jetzt starten"
          onClose={() => setStartPruefen(null)}
          onStart={() => {
            const satzId = startKandidat.eintrag.id
            setStartPruefen(null)
            starte(satzId)
          }}
          onAendern={() => {
            setStartPruefen(null)
            setAktiveOffen(true)
          }}
          aendernLabel="Aktive ändern"
        >
          <StartuebersichtTraining
            training={training}
            fortschritt={fortschritt}
            namen={namenProPlatz}
            startSatzId={startKandidat.eintrag.id}
          />
        </Startuebersicht>
      ) : null}

      <Bestaetigung
        open={frageLoeschen}
        titel="Training löschen?"
        text="Der Plan wird gelöscht. Bereits gemessene Sätze und Läufe bleiben im Verlauf erhalten."
        bestaetigenLabel="Training löschen"
        onBestaetigen={() => {
          setFrageLoeschen(false)
          // Zuerst die Auswahl lösen, damit die Detailansicht nicht auf ein
          // gerade gelöschtes Training zeigt.
          waehle(null)
          app.loescheTraining(training.id)
        }}
        onAbbrechen={() => setFrageLoeschen(false)}
      />
    </div>
  )
}

/** Kleines Sheet zum Umbenennen des Trainings; speichert erst auf Knopfdruck. */
function UmbenennenSheet({
  wert,
  onClose,
  onSpeichern,
}: {
  wert: string
  onClose: () => void
  onSpeichern: (wert: string) => void
}) {
  const [entwurf, setEntwurf] = useState(wert)
  return (
    <Sheet open onClose={onClose} titel="Training benennen">
      <input
        autoFocus
        value={entwurf}
        onChange={(event) => setEntwurf(event.target.value)}
        placeholder="z. B. Kader A, Dienstag"
        aria-label="Bezeichnung des Trainings"
        className="h-12 w-full rounded-xl border border-line bg-surface2 px-3 text-base"
      />
      <button
        type="button"
        onClick={() => onSpeichern(entwurf)}
        className="mt-4 h-14 w-full rounded-xl bg-accent text-base font-bold text-accent-fg"
      >
        Speichern
      </button>
    </Sheet>
  )
}
