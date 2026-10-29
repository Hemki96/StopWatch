import { useState } from 'react'
import { useApp } from '../app/AppProvider'
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
import { Sheet } from './Sheet'
import { TrainingsSatzSheet } from './TrainingsSatzSheet'
import { ChevronLeftIcon, PlusIcon, TrashIcon } from './icons'

const AUSWAHL_KEY = 'beckenrand.training'

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

const datumFormat = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
})

function leseAuswahl(): string | null {
  try {
    return localStorage.getItem(AUSWAHL_KEY)
  } catch {
    return null
  }
}

function merkeAuswahl(id: string | null): void {
  try {
    if (id) localStorage.setItem(AUSWAHL_KEY, id)
    else localStorage.removeItem(AUSWAHL_KEY)
  } catch {
    // Ohne Speicher startet der Tab beim nächsten Mal wieder in der Liste.
  }
}

function datumLabel(datum: string): string {
  const parsed = new Date(`${datum}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? datum : datumFormat.format(parsed)
}

function fortschrittText(fortschritt: TrainingsSatzFortschritt[]): string {
  const { fertig, gesamt } = trainingZusammenfassung(fortschritt)
  return `${fertig} von ${gesamt} ${gesamt === 1 ? 'Satz' : 'Sätzen'} erledigt`
}

interface TrainingScreenProps {
  onZumTimer: () => void
}

export function TrainingScreen({ onZumTimer }: TrainingScreenProps) {
  const app = useApp()
  const [gewaehlt, setGewaehlt] = useState<string | null>(leseAuswahl)
  const [neuerSatz, setNeuerSatz] = useState<TrainingsSatz | null>(null)
  const [bearbeitet, setBearbeitet] = useState<string | null>(null)
  const [aktiveOffen, setAktiveOffen] = useState(false)
  const [umbenennen, setUmbenennen] = useState(false)
  const [frageLoeschen, setFrageLoeschen] = useState(false)

  const training = app.trainings.find((eintrag) => eintrag.id === gewaehlt) ?? null

  const waehle = (id: string | null) => {
    setGewaehlt(id)
    merkeAuswahl(id)
  }

  if (!training) {
    return (
      <div className="flex h-full flex-col">
        <header className="border-b border-line px-4 py-3">
          <h1 className="text-lg font-semibold">Training</h1>
          <p className="text-xs text-muted">
            {app.trainings.length === 1
              ? '1 Training vorbereitet'
              : `${app.trainings.length} Trainings vorbereitet`}
          </p>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-8 pt-3">
          {app.trainings.length === 0 ? (
            <div className="mt-16 px-4 text-center">
              <p className="text-sm font-semibold">Noch kein Training vorbereitet</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Lege vorab die Aktiven und die Sätze fest. Im Training startest du dann Satz für
                Satz und kannst noch nicht gestartete Sätze jederzeit ändern.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {app.trainings.map((eintrag) => {
                const fortschritt = trainingsFortschritt(eintrag, app.satze, app.laeufe)
                const { fertig, gesamt } = trainingZusammenfassung(fortschritt)
                const aktive = eintrag.aktive.filter(Boolean).length
                return (
                  <li key={eintrag.id}>
                    <button
                      type="button"
                      onClick={() => waehle(eintrag.id)}
                      className="w-full rounded-2xl border border-line bg-surface p-4 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                          {datumLabel(eintrag.datum)}
                        </span>
                        {gesamt > 0 && fertig === gesamt ? (
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
  const naechster = naechsterSatz(fortschritt)
  const namen = training.aktive
    .map((id) => (id ? app.schwimmer.find((eintrag) => eintrag.id === id)?.name : null))
    .filter((name): name is string => Boolean(name))
  const bearbeiteterSatz = bearbeitet
    ? (training.saetze.find((eintrag) => eintrag.id === bearbeitet) ?? null)
    : null

  const speichere = (naechstes: Training) => app.speichereTraining(naechstes)

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

  const entferneSatz = (satzId: string) => {
    if (training.saetze.length <= 1) {
      app.zeigeToast('Ein Training braucht mindestens einen Satz.')
      return
    }
    speichere(ohneTrainingsSatz(training, satzId))
    setBearbeitet(null)
  }

  const verschiebe = (satzId: string, richtung: -1 | 1) => {
    speichere(verschiebeTrainingsSatz(training, satzId, richtung))
  }

  const starte = (satzId: string) => {
    const laufId = app.starteTrainingsSatz(
      training.id,
      satzId,
      performance.now(),
      Date.now(),
    )
    if (laufId) onZumTimer()
  }

  const oeffneSatz = (eintrag: TrainingsSatzFortschritt) => {
    if (eintrag.status === 'offen') {
      setBearbeitet(eintrag.eintrag.id)
      return
    }
    if (eintrag.status === 'fertig') return
    starte(eintrag.eintrag.id)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-line px-2 py-2">
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
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-4">
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
            {training.bahnen} {training.bahnen === 1 ? 'Bahn' : 'Bahnen'}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted">
            {namen.length > 0 ? namen.join(', ') : 'Noch keine Aktiven gewählt'}
          </span>
        </button>

        <div className="mt-3 flex items-center gap-2 px-1">
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

        <h2 className="mb-2 mt-6 px-1 text-[11px] font-bold uppercase tracking-wider text-muted">
          Sätze
        </h2>
        <ol className="space-y-2">
          {fortschritt.map((eintrag) => {
            const titel = trainingsSatzTitel(eintrag.eintrag)
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
            const basis = training.saetze.at(-1) ?? neuerTrainingsSatz()
            setNeuerSatz(
              neuerTrainingsSatz({
                ...basis,
                id: undefined,
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

      <div className="border-t border-line p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        {naechster ? (
          <button
            type="button"
            onClick={() => starte(naechster.eintrag.id)}
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

      {bearbeiteterSatz ? (
        <TrainingsSatzSheet
          satz={bearbeiteterSatz}
          bahnen={training.bahnen}
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
          onSpeichern={(bahnen, aktive) => {
            speichere({ ...training, bahnen, aktive })
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

      <Bestaetigung
        open={frageLoeschen}
        titel="Training löschen?"
        text="Der Plan wird gelöscht. Bereits gemessene Sätze und Läufe bleiben im Verlauf erhalten."
        bestaetigenLabel="Training löschen"
        onBestaetigen={() => {
          setFrageLoeschen(false)
          waehle(null)
          app.loescheTraining(training.id)
        }}
        onAbbrechen={() => setFrageLoeschen(false)}
      />
    </div>
  )
}

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
