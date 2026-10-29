/**
 * Aktionen für Schwimmer-Stammdaten: anlegen, ändern und löschen.
 *
 * Löschen ist bewusst kein Kaskadenlöschen: Läufe, Einstellungen und
 * vorbereitete Trainings verlieren nur die Zuordnung, die Zeiten bleiben im
 * Verlauf. Eine gelöschte Person darf keine Messreihe mitnehmen.
 */
import type { Lauf, Schwimmer, Training } from '../domain/types'
import { newId } from '../domain/id'
import { deleteSchwimmer, saveLauf, saveSchwimmer, saveTraining } from '../storage/repository'
import { sortiereSchwimmer } from './schwimmer'
import type { Ref } from './ref'
import type { Einstellungen } from './einstellungen'

export interface SchwimmerAktionenDeps {
  istAktiv: () => boolean
  verfolge: <T>(vorgang: () => Promise<T>) => Promise<T>
  schwimmerRef: Ref<Schwimmer[]>
  laeufeRef: Ref<Lauf[]>
  trainingsRef: Ref<Training[]>
  setSchwimmer: (schwimmer: Schwimmer[]) => void
  setLaeufe: (laeufe: Lauf[]) => void
  setTrainings: (trainings: Training[]) => void
  getEinstellungen: () => Einstellungen
  setzeEinstellungen: (einstellungen: Einstellungen) => void
}

export interface SchwimmerAktionen {
  speichereSchwimmer: (daten: {
    id?: string
    name: string
    jahrgang: number | null
    notiz: string
  }) => Schwimmer | null
  loescheSchwimmer: (id: string) => void
}

export function createSchwimmerAktionen(deps: SchwimmerAktionenDeps): SchwimmerAktionen {
  const {
    istAktiv,
    verfolge,
    schwimmerRef,
    laeufeRef,
    trainingsRef,
    setSchwimmer,
    setLaeufe,
    setTrainings,
    getEinstellungen,
    setzeEinstellungen,
  } = deps

  return {
    /**
     * Legt einen Schwimmer an oder aktualisiert ihn (anhand von `daten.id`).
     * Name und Notiz werden getrimmt, ein leerer Name wird abgelehnt.
     * `erstelltAm` bleibt bei einer Bearbeitung erhalten.
     */
    speichereSchwimmer: (daten) => {
      if (!istAktiv()) return null
      const name = daten.name.trim()
      if (!name) return null
      const vorhanden = daten.id
        ? schwimmerRef.current.find((s) => s.id === daten.id)
        : undefined
      const eintrag: Schwimmer = {
        id: vorhanden?.id ?? newId(),
        name,
        jahrgang: daten.jahrgang,
        notiz: daten.notiz.trim(),
        erstelltAm: vorhanden?.erstelltAm ?? Date.now(),
      }
      setSchwimmer(
        sortiereSchwimmer([
          ...schwimmerRef.current.filter((s) => s.id !== eintrag.id),
          eintrag,
        ]),
      )
      verfolge(() => saveSchwimmer(eintrag))
      return eintrag
    },

    /**
     * Löscht einen Schwimmer und räumt alle Verweise darauf auf. Die
     * Einstellungen werden zum Aufrufzeitpunkt gelesen, nicht aus dem
     * Render-Closure, damit eine parallele Änderung nicht überschrieben wird.
     */
    loescheSchwimmer: (id) => {
      if (!istAktiv()) return
      setSchwimmer(schwimmerRef.current.filter((s) => s.id !== id))
      verfolge(() => deleteSchwimmer(id))

      const geaenderteLaeufe: Lauf[] = []
      const naechsteLaeufe = laeufeRef.current.map((lauf) => {
        if (!lauf.bahnen.some((bahn) => bahn.schwimmerId === id)) return lauf
        const geaendert: Lauf = {
          ...lauf,
          bahnen: lauf.bahnen.map((bahn) =>
            bahn.schwimmerId === id ? { ...bahn, schwimmerId: null } : bahn,
          ),
        }
        geaenderteLaeufe.push(geaendert)
        return geaendert
      })
      if (geaenderteLaeufe.length > 0) {
        setLaeufe(naechsteLaeufe)
        for (const lauf of geaenderteLaeufe) verfolge(() => saveLauf(lauf))
      }

      const einstellungen = getEinstellungen()
      if (einstellungen.schwimmerProBahn.includes(id)) {
        setzeEinstellungen({
          ...einstellungen,
          schwimmerProBahn: einstellungen.schwimmerProBahn.map((wert) =>
            wert === id ? null : wert,
          ),
        })
      }

      // Auch vorbereitete Trainings dürfen nicht auf einen gelöschten
      // Schwimmer zeigen; die Bahn bleibt bestehen, nur ohne Zuordnung.
      const geaenderteTrainings: Training[] = []
      const naechsteTrainings = trainingsRef.current.map((training) => {
        if (!training.aktive.includes(id)) return training
        const geaendert: Training = {
          ...training,
          aktive: training.aktive.map((wert) => (wert === id ? null : wert)),
        }
        geaenderteTrainings.push(geaendert)
        return geaendert
      })
      if (geaenderteTrainings.length > 0) {
        setTrainings(naechsteTrainings)
        for (const training of geaenderteTrainings) verfolge(() => saveTraining(training))
      }
    },
  }
}
