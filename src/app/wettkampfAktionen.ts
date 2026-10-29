/**
 * Aktionen rund um Wettkämpfe: anlegen, importieren, Heats bedienen, löschen.
 *
 * Wie `laufAktionen` ist das Modul eine Fabrik: Der Provider reicht Ref-Spiegel
 * und Schreibfunktionen hinein. Wettkampf-Heats stehen nicht in der
 * Trainingsleiste; sie werden direkt über `aendereLauf` geschrieben. Jede
 * Aktion ist No-Op, solange der Tab nicht die Messung hält.
 */
import {
  type Beckenlaenge,
  type Einheit,
  type Lauf,
  type Satz,
  type Schwimmer,
  type Schwimmart,
  type Wettkampf,
  type WettkampfStatus,
} from '../domain/types'
import { einheitVon } from '../domain/einheit'
import { istVielfacheDerBeckenlaenge, setzeWettkampfStatus as setzeWettkampfStatusImLauf, setzeZielzeit, startAll, tapLane, undoLane, setSchwimmer as setSchwimmerOnLane } from '../domain/lauf'
import {
  createWettkampf,
  createWettkampfLauf,
  createWettkampfSatz,
  disziplinBezeichnung,
  type WettkampfDisziplinPlan,
  type WettkampfPlan,
} from '../domain/wettkampf'
import {
  deleteWettkampfUndDaten,
  saveMehrere,
  saveSchwimmer,
  saveWettkampf,
} from '../storage/repository'
import { schwimmerIdFuer, sortiereSchwimmer } from './schwimmer'

interface Ref<T> {
  current: T
}

export interface WettkampfAktionenDeps {
  istAktiv: () => boolean
  verfolge: <T>(vorgang: Promise<T>) => Promise<T>
  laeufeRef: Ref<Lauf[]>
  satzeRef: Ref<Satz[]>
  wettkampfeRef: Ref<Wettkampf[]>
  schwimmerRef: Ref<Schwimmer[]>
  aktiveIdsRef: Ref<string[]>
  aktiverLaufIdRef: Ref<string | null>
  setLaeufe: (laeufe: Lauf[]) => void
  setSatze: (satze: Satz[]) => void
  setWettkampfe: (wettkampfe: Wettkampf[]) => void
  setSchwimmer: (schwimmer: Schwimmer[]) => void
  setAktiveIds: (ids: string[]) => void
  setAktivenLaufId: (id: string | null) => void
  /** Schreibpfad für einen beliebigen Lauf, aus `laufAktionen`. */
  aendereLauf: (lauf: Lauf, naechster: Lauf) => void
}

export interface WettkampfAktionen {
  erstelleWettkampf: (daten: {
    name: string
    datum: string
    beckenlaengeM: Beckenlaenge
    einheit?: Einheit
  }) => string | null
  benenneWettkampf: (id: string, name: string) => void
  importiereWettkampf: (plan: WettkampfPlan, wettkampfId?: string | null) => string | null
  erstelleWettkampfDisziplin: (
    wettkampfId: string,
    disziplin: {
      bezeichnung: string
      streckeM: number
      schwimmart: Schwimmart
      laeufe: number
      bahnen: number
    },
  ) => string | null
  loescheWettkampf: (id: string) => void
  starteWettkampfLauf: (laufId: string, now: number, wallNow: number) => void
  tippeWettkampf: (laufId: string, bahnId: string, now: number, wallNow: number) => void
  rueckgaengigWettkampf: (laufId: string, bahnId: string) => void
  setzeWettkampfZeit: (laufId: string, bahnId: string, splitMs: number) => void
  setzeWettkampfStatus: (
    laufId: string,
    bahnId: string,
    status: WettkampfStatus | null,
  ) => void
  setzeWettkampfNamen: (laufId: string, namen: string[]) => void
}

export function createWettkampfAktionen(deps: WettkampfAktionenDeps): WettkampfAktionen {
  const {
    istAktiv,
    verfolge,
    laeufeRef,
    satzeRef,
    wettkampfeRef,
    schwimmerRef,
    aktiveIdsRef,
    aktiverLaufIdRef,
    setLaeufe,
    setSatze,
    setWettkampfe,
    setSchwimmer,
    setAktiveIds,
    setAktivenLaufId,
    aendereLauf,
  } = deps

  function findeLauf(laufId: string): Lauf | undefined {
    return laeufeRef.current.find((eintrag) => eintrag.id === laufId)
  }

  /**
   * Schreibt einen geprüften Meldelisten-Plan in die Datenhaltung.
   *
   * Mit `wettkampfId` wird ein bestehender Wettkampf ergänzt; sein Name bleibt.
   * Ohne ID entsteht ein neuer Wettkampf aus den Planangaben. Der Import ist
   * eine Transaktion: Erst werden alle Sätze, Läufe und Schwimmer gesammelt,
   * dann gemeinsam gesetzt und geschrieben. Ein halb importierter Wettkampf
   * kann so nicht entstehen.
   */
  function importiereWettkampf(plan: WettkampfPlan, wettkampfId: string | null = null): string | null {
    if (!istAktiv()) return null
    const name = plan.name.trim()
    if (!name || plan.disziplinen.length === 0) return null

    const vorhanden = wettkampfId
      ? wettkampfeRef.current.find((eintrag) => eintrag.id === wettkampfId)
      : undefined
    const wettkampf =
      vorhanden ??
      createWettkampf({
        name,
        datum: plan.datum,
        beckenlaengeM: plan.beckenlaengeM,
        ...(plan.einheit ? { einheit: plan.einheit } : {}),
      })
    if (!vorhanden) {
      setWettkampfe([wettkampf, ...wettkampfeRef.current])
    }

    const neueSchwimmer: Schwimmer[] = []
    const neueSatze: Satz[] = []
    const neueLaeufe: Lauf[] = []
    // Die Sätze bekommen gestaffelte Zeitstempel, damit die Sortierung im
    // Verlauf der Reihenfolge der Disziplinen in der Meldeliste folgt.
    const jetzt = Date.now()

    plan.disziplinen.forEach((disziplin, index) => {
      // Ein Wettkampf-Satz ist eine Disziplin; seine Läufe sind die Heats.
      const satz = createWettkampfSatz(wettkampf, disziplin, jetzt + index)
      neueSatze.push(satz)
      for (const laufPlan of disziplin.laeufe) {
        neueLaeufe.push(
          createWettkampfLauf(satz, laufPlan, (start) =>
            schwimmerIdFuer(
              start.name,
              start.jahrgang ?? null,
              schwimmerRef.current,
              neueSchwimmer,
            ),
          ),
        )
      }
    })

    if (neueSchwimmer.length > 0) {
      setSchwimmer(sortiereSchwimmer([...schwimmerRef.current, ...neueSchwimmer]))
    }

    setSatze([...neueSatze, ...satzeRef.current])
    setLaeufe([...neueLaeufe, ...laeufeRef.current])
    // Ein Wettkampf mit Disziplinen, Heats und neuen Schwimmern gehört
    // zusammen: eine Transaktion statt bis zu tausender Einzel-Schreibvorgänge.
    verfolge(
      saveMehrere({
        wettkampfe: vorhanden ? [] : [wettkampf],
        schwimmer: neueSchwimmer,
        satze: neueSatze,
        laeufe: neueLaeufe,
      }),
    )
    return wettkampf.id
  }

  return {
    erstelleWettkampf: (daten) => {
      if (!istAktiv()) return null
      const name = daten.name.trim()
      if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(daten.datum)) return null
      const wettkampf = createWettkampf({ ...daten, name })
      setWettkampfe([wettkampf, ...wettkampfeRef.current])
      verfolge(saveWettkampf(wettkampf))
      return wettkampf.id
    },

    benenneWettkampf: (id, name) => {
      if (!istAktiv()) return
      const wettkampf = wettkampfeRef.current.find((eintrag) => eintrag.id === id)
      if (!wettkampf) return
      const naechster = { ...wettkampf, name: name.trim() || wettkampf.name }
      setWettkampfe(
        wettkampfeRef.current.map((eintrag) => (eintrag.id === id ? naechster : eintrag)),
      )
      verfolge(saveWettkampf(naechster))
    },

    importiereWettkampf,

    /**
     * Legt eine Disziplin von Hand an — ohne Meldeliste, etwa wenn kurzfristig
     * ein Heat ergänzt wird. Die Strecke muss ein Vielfaches der Beckenlänge
     * des Wettkampfs sein; Läufe und Bahnen werden auf 20 bzw. 10 begrenzt.
     */
    erstelleWettkampfDisziplin: (wettkampfId, disziplin) => {
      if (!istAktiv()) return null
      const wettkampf = wettkampfeRef.current.find((eintrag) => eintrag.id === wettkampfId)
      if (!wettkampf) return null
      const streckeM = Math.round(disziplin.streckeM * 100) / 100
      if (
        !Number.isFinite(streckeM) ||
        streckeM <= 0 ||
        !istVielfacheDerBeckenlaenge(streckeM, wettkampf.beckenlaengeM)
      ) {
        return null
      }
      const einheit: Einheit = einheitVon(wettkampf)
      const laeufe = Math.min(20, Math.max(1, Math.round(disziplin.laeufe)))
      const bahnen = Math.min(10, Math.max(1, Math.round(disziplin.bahnen)))
      const plan: WettkampfDisziplinPlan = {
        // Ohne eigene Bezeichnung heißt die Disziplin wie ihre Strecke, z. B.
        // „100 m Freistil“; das ist auch der Name im Verlauf.
        bezeichnung:
          disziplin.bezeichnung.trim() ||
          disziplinBezeichnung(streckeM, disziplin.schwimmart, einheit),
        streckeM,
        schwimmart: disziplin.schwimmart,
        einheit,
        laeufe: Array.from({ length: laeufe }, (_, index) => ({
          nummer: index + 1,
          starts: Array.from({ length: bahnen }, (_, bahnIndex) => ({
            name: '',
            bahn: bahnIndex + 1,
          })),
        })),
      }

      const satz = createWettkampfSatz(wettkampf, plan)
      const neueLaeufe = plan.laeufe.map((laufPlan) =>
        createWettkampfLauf(satz, laufPlan, (start) =>
          schwimmerIdFuer(start.name, start.jahrgang ?? null, schwimmerRef.current, []),
        ),
      )
      setSatze([satz, ...satzeRef.current])
      setLaeufe([...neueLaeufe, ...laeufeRef.current])
      verfolge(saveMehrere({ satze: [satz], laeufe: neueLaeufe }))
      return satz.id
    },

    /**
     * Löscht einen Wettkampf mit allen Disziplinen, Heats und Ergebnissen.
     * Die betroffenen IDs werden vor dem Filtern bestimmt.
     */
    loescheWettkampf: (id) => {
      if (!istAktiv()) return
      const satzIds = new Set(
        satzeRef.current.filter((satz) => satz.wettkampfId === id).map((satz) => satz.id),
      )
      // Vor dem Filtern bestimmen: Danach sind die betroffenen Läufe aus dem
      // Ref verschwunden und ließen sich nicht mehr zuordnen.
      const geloeschteLaufIds = new Set(
        laeufeRef.current
          .filter((lauf) => lauf.satzId !== null && satzIds.has(lauf.satzId))
          .map((lauf) => lauf.id),
      )
      setWettkampfe(wettkampfeRef.current.filter((eintrag) => eintrag.id !== id))
      setSatze(satzeRef.current.filter((satz) => !satzIds.has(satz.id)))
      setLaeufe(laeufeRef.current.filter((lauf) => !lauf.satzId || !satzIds.has(lauf.satzId)))
      const naechsteAktive = aktiveIdsRef.current.filter(
        (eintrag) => !geloeschteLaufIds.has(eintrag),
      )
      if (naechsteAktive.length !== aktiveIdsRef.current.length) {
        setAktiveIds(naechsteAktive)
        if (!naechsteAktive.includes(aktiverLaufIdRef.current ?? '')) {
          setAktivenLaufId(naechsteAktive[0] ?? null)
        }
      }
      verfolge(deleteWettkampfUndDaten(id))
    },

    /**
     * Startet einen Heat. Heats stehen nicht in der Trainingsleiste; deshalb
     * geht der Start direkt über `aendereLauf`. Alle Bahnen starten gemeinsam.
     */
    starteWettkampfLauf: (laufId, now, wallNow) => {
      if (!istAktiv()) return
      const lauf = findeLauf(laufId)
      if (!lauf) return
      aendereLauf(lauf, startAll(lauf, now, wallNow))
    },

    /**
     * Tap im Wettkampf: Der erste Tap nach dem Start ist das Ziel. Das
     * Verzweigen übernimmt `tapLane` anhand von `lauf.modus`.
     */
    tippeWettkampf: (laufId, bahnId, now, wallNow) => {
      if (!istAktiv()) return
      const lauf = findeLauf(laufId)
      if (!lauf) return
      aendereLauf(lauf, tapLane(lauf, bahnId, now, wallNow))
    },

    /** Nimmt den Zielanschlag eines Heats zurück (Fehleingabe beim Tippen). */
    rueckgaengigWettkampf: (laufId, bahnId) => {
      if (!istAktiv()) return
      const lauf = findeLauf(laufId)
      if (!lauf) return
      aendereLauf(lauf, undoLane(lauf, bahnId))
    },

    /**
     * Trägt eine Zielzeit von Hand ein oder korrigiert sie. Die Zeit wird als
     * `manuell` markiert, damit sie in CSV und Bestzeiten erkennbar bleibt.
     */
    setzeWettkampfZeit: (laufId, bahnId, splitMs) => {
      if (!istAktiv()) return
      const lauf = findeLauf(laufId)
      if (!lauf) return
      aendereLauf(lauf, setzeZielzeit(lauf, bahnId, splitMs))
    },

    /**
     * Markiert eine Bahn als DNS/DNF oder hebt die Markierung auf. Die Domäne
     * lehnt gewertete Bahnen und Trainingsläufe ab.
     */
    setzeWettkampfStatus: (laufId, bahnId, status) => {
      if (!istAktiv()) return
      const lauf = findeLauf(laufId)
      if (!lauf) return
      aendereLauf(lauf, setzeWettkampfStatusImLauf(lauf, bahnId, status))
    },

    /**
     * Setzt die Namen aller Bahnen eines Heats in einem Schritt. Unbekannte
     * Namen legen neue Schwimmer an, leere Namen entfernen die Zuordnung.
     */
    setzeWettkampfNamen: (laufId, namen) => {
      if (!istAktiv()) return
      const lauf = findeLauf(laufId)
      if (!lauf) return
      const neueSchwimmer: Schwimmer[] = []
      const ids = namen.map((name) =>
        schwimmerIdFuer(name, null, schwimmerRef.current, neueSchwimmer),
      )
      let naechster = lauf
      lauf.bahnen.forEach((bahn, index) => {
        naechster = setSchwimmerOnLane(naechster, bahn.id, ids[index] ?? null)
      })
      if (neueSchwimmer.length > 0) {
        setSchwimmer(sortiereSchwimmer([...schwimmerRef.current, ...neueSchwimmer]))
        for (const eintrag of neueSchwimmer) verfolge(saveSchwimmer(eintrag))
      }
      aendereLauf(lauf, naechster)
    },
  }
}
