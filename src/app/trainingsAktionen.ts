/**
 * Aktionen für Trainingspläne: anlegen, speichern, löschen und starten.
 *
 * Ein Training ist Vorbereitung, nicht Besitz der Messungen: Beim Start
 * entstehen Satz und Läufe, die danach unabhängig vom Plan weiterleben.
 * `training.gestartet` merkt sich die Satz-ID, damit ein zweiter Tap keine
 * zweite Messung erzeugt.
 */
import type { Lauf, Satz, Training } from '../domain/types'
import { createLauf } from '../domain/lauf'
import {
  bahnenGesamt,
  beschreibeTrainingsSatz,
  neuerTrainingsSatz,
  neuesTraining,
  pruefeTraining,
  pruefeTrainingsSatz,
} from '../domain/training'
import { newId } from '../domain/id'
import { deleteTraining, saveMehrere, saveTraining } from '../storage/repository'
import type { Ref } from './ref'
import { heute } from './datum'
import type { Einstellungen } from './einstellungen'

export interface TrainingsAktionenDeps {
  istAktiv: () => boolean
  verfolge: <T>(vorgang: Promise<T>) => Promise<T>
  laeufeRef: Ref<Lauf[]>
  satzeRef: Ref<Satz[]>
  trainingsRef: Ref<Training[]>
  aktiveIdsRef: Ref<string[]>
  setLaeufe: (laeufe: Lauf[]) => void
  setSatze: (satze: Satz[]) => void
  setTrainings: (trainings: Training[]) => void
  setAktiveIds: (ids: string[]) => void
  setAktivenLaufId: (id: string | null) => void
  getEinstellungen: () => Einstellungen
  /** Startet den sichtbaren Lauf, aus `laufAktionen`. */
  startAlle: (now: number, wallNow: number) => void
  /** Wählt einen bestehenden Satz, aus `laufAktionen`. */
  aktiviereSatz: (satz: Satz) => string | null
}

export interface TrainingsAktionen {
  anlegeTraining: () => string | null
  speichereTraining: (training: Training) => void
  loescheTraining: (id: string) => void
  starteTrainingsSatz: (
    trainingId: string,
    trainingsSatzId: string,
    now: number,
    wallNow: number,
  ) => string | null
}

export function createTrainingsAktionen(deps: TrainingsAktionenDeps): TrainingsAktionen {
  const {
    istAktiv,
    verfolge,
    laeufeRef,
    satzeRef,
    trainingsRef,
    aktiveIdsRef,
    setLaeufe,
    setSatze,
    setTrainings,
    setAktiveIds,
    setAktivenLaufId,
    getEinstellungen,
    startAlle,
    aktiviereSatz,
  } = deps

  return {
    /**
     * Legt ein neues Training aus den aktuellen Einstellungen an. Es startet
     * mit einem vorbereiteten Satz, damit die Vorbereitung nicht leer beginnt.
     */
    anlegeTraining: () => {
      if (!istAktiv()) return null
      const werte = getEinstellungen()
      const training = neuesTraining({
        datum: heute(),
        bahnen: werte.bahnen,
        reihen: werte.reihen,
        aktive: werte.schwimmerProBahn,
        saetze: [
          neuerTrainingsSatz({
            konfiguration: { ...werte.konfiguration },
            wiederholungen: werte.wiederholungen,
            taktSek: werte.taktSek,
            startversatzMs: werte.startversatzMs,
          }),
        ],
      })
      setTrainings([training, ...trainingsRef.current])
      verfolge(saveTraining(training))
      return training.id
    },

    /**
     * Speichert einen Trainingsplan (neu oder geändert). Ungültige Pläne
     * werden verworfen, nicht teilweise übernommen. Ob ein Satz schon
     * gestartet ist, entscheidet die Oberfläche anhand des Fortschritts.
     */
    speichereTraining: (training) => {
      if (!istAktiv()) return
      if (pruefeTraining(training) !== null) return
      const vorhanden = trainingsRef.current.some((eintrag) => eintrag.id === training.id)
      setTrainings(
        vorhanden
          ? trainingsRef.current.map((eintrag) =>
              eintrag.id === training.id ? training : eintrag,
            )
          : [training, ...trainingsRef.current],
      )
      verfolge(saveTraining(training))
    },

    /**
     * Löscht nur den Trainingsplan. Bereits gestartete Sätze und ihre Läufe
     * bleiben im Verlauf.
     */
    loescheTraining: (id) => {
      if (!istAktiv()) return
      setTrainings(trainingsRef.current.filter((eintrag) => eintrag.id !== id))
      verfolge(deleteTraining(id))
    },

    /**
     * Startet einen vorbereiteten Trainingssatz oder wählt ihn erneut aus.
     *
     * Reihenfolge am Ende ist wichtig: erst State und Persistenz, dann Leiste,
     * dann `startAlle(now, …)`. So plant `startAlle` exakt die neuen Läufe mit
     * demselben Zeitstempel, ohne dass ein Render dazwischenkommt.
     */
    starteTrainingsSatz: (trainingId, trainingsSatzId, now, wallNow) => {
      if (!istAktiv()) return null
      const training = trainingsRef.current.find((eintrag) => eintrag.id === trainingId)
      const eintrag = training?.saetze.find((satz) => satz.id === trainingsSatzId)
      if (!training || !eintrag) return null
      if (pruefeTrainingsSatz(eintrag) !== null) return null

      // Schon gestartet? Dann nur auswählen — sonst entstünde eine zweite
      // Messung für denselben Trainingssatz.
      const vorhandenerSatz = training.gestartet[eintrag.id]
        ? satzeRef.current.find((satz) => satz.id === training.gestartet[eintrag.id])
        : undefined
      if (vorhandenerSatz) return aktiviereSatz(vorhandenerSatz)

      const satz: Satz = {
        id: newId(),
        datum: training.datum,
        bezeichnung: eintrag.bezeichnung.trim() || beschreibeTrainingsSatz(eintrag),
        konfiguration: { ...eintrag.konfiguration },
        plan:
          eintrag.wiederholungen > 1
            ? {
                wiederholungen: eintrag.wiederholungen,
                taktSek: eintrag.taktSek,
                startversatzMs: eintrag.startversatzMs,
              }
            : null,
        erstelltAm: Date.now(),
      }
      // Aktive und Bahnenzahl werden kopiert, nicht referenziert: Änderungen am
      // Training gelten nur für noch nicht gestartete Sätze. Die Personen sind
      // Reihe für Reihe abgelegt; `nummer` zählt innerhalb der Reihe.
      const bahnenInit = Array.from(
        { length: bahnenGesamt(training.bahnen, training.reihen) },
        (_, index) => ({
          nummer: (index % training.bahnen) + 1,
          reihe: Math.floor(index / training.bahnen) + 1,
          schwimmerId: training.aktive[index] ?? null,
        }),
      )
      const neueLaeufe = Array.from({ length: eintrag.wiederholungen }, (_, index) =>
        createLauf(eintrag.konfiguration, bahnenInit, satz.id, {
          startversatzMs: eintrag.startversatzMs,
          wiederholung: satz.plan ? index + 1 : null,
        }),
      )
      const anker = neueLaeufe[0]
      if (!anker) return null

      const naechstesTraining: Training = {
        ...training,
        gestartet: { ...training.gestartet, [eintrag.id]: satz.id },
      }
      setSatze([satz, ...satzeRef.current])
      setLaeufe([...neueLaeufe, ...laeufeRef.current])
      setTrainings(
        trainingsRef.current.map((kandidat) =>
          kandidat.id === training.id ? naechstesTraining : kandidat,
        ),
      )
      // Satz, Trainingsverweis und Läufe gehören zusammen. Eine Transaktion
      // verhindert den Zustand „gestartet, aber ohne Läufe“ nach einem Abbruch.
      verfolge(saveMehrere({ satze: [satz], trainings: [naechstesTraining], laeufe: neueLaeufe }))

      setAktiveIds([...new Set([anker.id, ...aktiveIdsRef.current])])
      setAktivenLaufId(anker.id)
      // Erst anlegen, dann mit demselben Zeitstempel starten: Ein Takt von
      // mehreren Wiederholungen wird wie im Timer vorausberechnet.
      startAlle(now, wallNow)
      return anker.id
    },
  }
}
