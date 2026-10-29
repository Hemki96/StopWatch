/**
 * Aktionen rund um Läufe und Serien: messen, anlegen, auswählen, löschen.
 *
 * Der Modulrand ist eine Fabrik statt eines Hooks: Sie bekommt die Ref-Spiegel
 * und Schreibfunktionen des Providers und liefert stabile Aktionen zurück.
 * Dadurch bleibt die Tab-Rolle an genau einer Stelle geprüft, und die Aktionen
 * lassen sich ohne React-Render testen.
 *
 * Invarianten (vom Provider gehalten):
 * - `laeufeRef`/`satzeRef`/`aktiveIdsRef`/`aktiverLaufIdRef` sind immer der
 *   aktuelle Stand; geschrieben wird ausschließlich über die übergebenen
 *   Setter, die Ref und State gemeinsam setzen.
 * - Jede Aktion ist No-Op, solange `istAktiv()` falsch ist.
 * - Domänenfunktionen geben bei ungültigen Eingaben dasselbe Objekt zurück;
 *   ein identisches Ergebnis löst keinen Schreibvorgang aus.
 */
import {
  type Bahn,
  type Lauf,
  type LaufKonfiguration,
  type Satz,
} from '../domain/types'
import {
  bahnReihe,
  createLauf,
  finishLane,
  hasStarted,
  isComplete,
  isFinished,
  korrigiereAnschlag as korrigiereAnschlagImLauf,
  planeLauf,
  startAll,
  tapLane,
  undoLane,
  setSchwimmer as setSchwimmerOnLane,
  updateStrecke,
  validateKonfiguration,
} from '../domain/lauf'
import { letzterAnschlag, runden as rundenVon, istSerie } from '../domain/serie'
import { MAX_BAHNEN, bahnenGesamt } from '../domain/training'
import { newId } from '../domain/id'
import { deleteLauf, deleteSatzUndLaeufe, saveLauf, saveMehrere, saveSatz } from '../storage/repository'
import {
  STANDARD_EINSTELLUNGEN,
  begrenzeReihen,
  begrenzeTakt,
  begrenzeVersatz,
  begrenzeWiederholungen,
  type Einstellungen,
} from './einstellungen'
import type { Ref } from './ref'
import { heute } from './datum'
import { einheitVon } from '../domain/einheit'

/**
 * Mindestabstand zwischen zwei Bedienhandlungen auf derselben Serienzeile.
 *
 * Ein schneller Doppeltipp am Beckenrand würde sonst zwei Runden schließen:
 * Der erste Tap beendet die älteste offene Runde, der zweite trifft bereits die
 * nächste, oft mit unrealistisch kurzer Zeit (#54). Die Zielrunde taugt deshalb
 * nicht zur Unterscheidung; das Fenster gilt pro Zeile für Tap, Klick und
 * Tastatur gleichermaßen.
 */
const SERIEN_TIPP_SPERRE_MS = 300

/** Art der Bedienhandlung auf einer Serienzeile: Anschlag oder Ziel. */
type SerienBedienung = 'tippe' | 'beende'

export interface LaufAktionenDeps {
  istAktiv: () => boolean
  verfolge: <T>(vorgang: () => Promise<T>) => Promise<T>
  laeufeRef: Ref<Lauf[]>
  satzeRef: Ref<Satz[]>
  aktiveIdsRef: Ref<string[]>
  aktiverLaufIdRef: Ref<string | null>
  setLaeufe: (laeufe: Lauf[]) => void
  setSatze: (satze: Satz[]) => void
  setAktiveIds: (ids: string[]) => void
  setAktivenLaufId: (id: string | null) => void
  getEinstellungen: () => Einstellungen
  zeigeToast: (nachricht: string) => void
}

export interface LaufAktionen {
  startAlle: (now: number, wallNow: number) => void
  tippe: (bahnId: string, now: number, wallNow: number) => void
  tippeSerie: (bahnIndex: number, now: number, wallNow: number) => void
  beende: (bahnId: string, now: number, wallNow: number) => void
  beendeSerie: (bahnIndex: number, now: number, wallNow: number) => void
  rueckgaengig: (bahnId: string) => void
  rueckgaengigSerie: (bahnIndex: number) => void
  setzeSchwimmer: (bahnId: string, schwimmerId: string | null) => void
  setzeSchwimmerSerie: (bahnIndex: number, schwimmerId: string | null) => void
  setzeSchwimmerImLauf: (laufId: string, bahnId: string, schwimmerId: string | null) => void
  korrigiereAnschlag: (laufId: string, bahnId: string, laengeNr: number, splitMs: number) => void
  setzeKonfiguration: (konfiguration: LaufKonfiguration) => void
  neuerLauf: (
    konfiguration: LaufKonfiguration,
    bahnen: number,
    schwimmerProBahn?: (string | null)[],
    optionen?: { startversatzMs?: number; wiederholungen?: number; taktSek?: number; reihen?: number },
  ) => string | null
  anlegenLauf: () => void
  waehleLauf: (id: string) => void
  schliesseAktivenLauf: () => void
  verwerfeAktivenLauf: () => void
  loescheLauf: (id: string) => void
  loescheSatz: (id: string) => void
  benenneSatz: (id: string, bezeichnung: string) => void
  aktiviereSatz: (satz: Satz) => string | null
  /** Schreibt einen beliebigen Lauf; die Tab-Rolle prüfen die Aufrufer. */
  aendereLauf: (lauf: Lauf, naechster: Lauf) => void
}

/**
 * Vergleicht nur die fachlich relevanten Felder einer Lauf-Konfiguration.
 * Wird beim Anlegen eines einzelnen Laufs genutzt, um einen passenden Satz des
 * Tages wiederzuverwenden, statt für jeden Lauf einen neuen Satz anzulegen.
 */
function gleicheKonfiguration(a: LaufKonfiguration, b: LaufKonfiguration): boolean {
  return (
    a.beckenlaengeM === b.beckenlaengeM &&
    a.streckeM === b.streckeM &&
    a.schwimmart === b.schwimmart &&
    einheitVon(a) === einheitVon(b)
  )
}

export function createLaufAktionen(deps: LaufAktionenDeps): LaufAktionen {
  const {
    istAktiv,
    verfolge,
    laeufeRef,
    satzeRef,
    aktiveIdsRef,
    aktiverLaufIdRef,
    setLaeufe,
    setSatze,
    setAktiveIds,
    setAktivenLaufId,
    getEinstellungen,
    zeigeToast,
  } = deps

  /**
   * Letzter abgeschlossener Rundenwechsel je Serie, Bahn und Art. Nur ein
   * Abschluss öffnet das Doppeltipp-Fenster: Zwei Anschläge derselben Runde
   * (etwa 100 m in zwei Längen) bleiben erlaubt; erst der Tap, der eine Runde
   * beendet, blockiert für 300 ms die nächste Runde derselben Zeile.
   */
  let letzterAbschluss: { schluessel: string; rundeId: string; at: number } | null = null

  /** Schlüssel einer Serienzeile: Serie (Anker-Lauf), Bahnindex und Art. */
  function zeilenSchluessel(
    laufId: string,
    bahnIndex: number,
    art: SerienBedienung,
  ): string {
    return `${laufId}:${bahnIndex}:${art}`
  }

  /** Wahr, wenn derselbe Doppeltipp gerade eine andere Runde treffen würde. */
  function istDoppelterAbschluss(
    schluessel: string,
    rundeId: string,
    now: number,
  ): boolean {
    const abschluss = letzterAbschluss
    if (!abschluss || abschluss.schluessel !== schluessel) return false
    return (
      abschluss.rundeId !== rundeId && now - abschluss.at < SERIEN_TIPP_SPERRE_MS
    )
  }

  /** Merkt einen Rundenabschluss; ein normaler Anschlag löscht das Fenster. */
  function merkeAbschluss(
    schluessel: string,
    rundeId: string,
    abgeschlossen: boolean,
    now: number,
  ): void {
    if (abgeschlossen) {
      letzterAbschluss = { schluessel, rundeId, at: now }
    } else if (letzterAbschluss?.schluessel === schluessel) {
      letzterAbschluss = null
    }
  }

  /**
   * Wendet eine reine Domänenfunktion auf den sichtbaren Lauf an.
   *
   * Der gemeinsame Schreibpfad für alle Timer-Aktionen: Rolle prüfen, aktuellen
   * Stand aus der Ref holen, Funktion anwenden, bei echter Änderung State und
   * Speicher nachziehen.
   */
  function aktualisiereAktiven(fn: (lauf: Lauf) => Lauf): void {
    if (!istAktiv()) return
    const id = aktiverLaufIdRef.current
    if (!id) return
    const aktuell = laeufeRef.current.find((l) => l.id === id)
    if (!aktuell) return
    const naechster = fn(aktuell)
    if (naechster === aktuell) return
    setLaeufe(laeufeRef.current.map((l) => (l.id === id ? naechster : l)))
    verfolge(() => saveLauf(naechster))
  }

  /**
   * Schreibpfad für einen beliebigen Lauf, nicht nur den sichtbaren. Wird für
   * Serienrunden, Wettkampf-Heats und Korrekturen im Lauf-Detail gebraucht.
   * Das Tor wird hier erneut geprüft, damit kein Aufrufer die Sicherheitsprüfung
   * vergessen kann.
   */
  function aendereLauf(lauf: Lauf, naechster: Lauf): void {
    if (!istAktiv()) return
    if (naechster === lauf) return
    setLaeufe(laeufeRef.current.map((eintrag) => (eintrag.id === lauf.id ? naechster : eintrag)))
    verfolge(() => saveLauf(naechster))
  }

  /**
   * Aktuelle Serie des sichtbaren Laufs: Anker, Satz und alle Runden.
   * `null`, wenn der sichtbare Lauf keine Serie ist oder die Daten fehlen.
   */
  function holeAktiveSerie(): { lauf: Lauf; satz: Satz; runden: Lauf[] } | null {
    const id = aktiverLaufIdRef.current
    if (!id) return null
    const lauf = laeufeRef.current.find((eintrag) => eintrag.id === id)
    const satz = lauf?.satzId
      ? satzeRef.current.find((eintrag) => eintrag.id === lauf.satzId)
      : undefined
    if (!lauf || !istSerie(satz) || !satz) return null
    return { lauf, satz, runden: rundenVon(laeufeRef.current, satz.id) }
  }

  /**
   * Startet den sichtbaren Lauf — bei einer Serie alle Wiederholungen auf
   * einmal, mit vorausberechneten Startzeitpunkten.
   *
   * Der Serienzweig ist bewusst eigenständig (statt nur `startAll` aufzurufen),
   * weil er mehrere Läufe gleichzeitig ändert:
   * 1. Nur unberührte Runden (kein Start, kein Anschlag) werden neu geplant.
   * 2. Angefangene Runden mit fehlender Startzeit werden ergänzt — der Fall
   *    „Reload mitten in der Runde“; die fehlenden Bahnen starten jetzt (plus
   *    ihrem Startversatz), bereits erfasste Anschläge bleiben unberührt.
   * 3. Wird eine Runde fortgesetzt, beginnt die nächste einen Takt später,
   *    damit der Takt ab dem tatsächlichen Neustart weiterläuft.
   */
  function startAlle(now: number, wallNow: number): void {
    if (!istAktiv()) return
    const id = aktiverLaufIdRef.current
    if (!id) return
    const lauf = laeufeRef.current.find((eintrag) => eintrag.id === id)
    if (!lauf) return
    const satz = lauf.satzId
      ? satzeRef.current.find((eintrag) => eintrag.id === lauf.satzId)
      : undefined

    if (istSerie(satz) && satz?.plan) {
      const betroffen = rundenVon(laeufeRef.current, satz.id)
      const taktMs = satz.plan.taktSek * 1000
      const unberuehrt = betroffen.filter(
        (runde) => !hasStarted(runde) && runde.bahnen.every((bahn) => bahn.anschlaege.length === 0),
      )
      // Nach einem Reload oder einem abgebrochenen Start können einzelne
      // Bahnen einer bereits begonnenen Runde ohne Startzeit zurückbleiben.
      // „Weiter“ muss auch diese wieder aufnehmen, nicht nur unberührte
      // Runden planen.
      const fehlendeStarts = betroffen.some(
        (runde) =>
          !isComplete(runde) &&
          runde.bahnen.some((bahn) => bahn.startMs === null && !isFinished(bahn)),
      )
      if (unberuehrt.length === 0 && !fehlendeStarts) return

      const betroffeneIds = new Set(betroffen.map((runde) => runde.id))
      const unberuehrtIds = new Set(unberuehrt.map((runde) => runde.id))
      // Eine angefangene Runde ist unvollständig, aber nicht mehr unberührt.
      const teilweise = betroffen.some(
        (runde) =>
          !unberuehrtIds.has(runde.id) &&
          !isComplete(runde) &&
          runde.bahnen.some((bahn) => bahn.startMs === null && !isFinished(bahn)),
      )
      // Wird eine angefangene Runde jetzt fortgesetzt, beginnt die nächste
      // unberührte Runde erst einen Takt später statt gleichzeitig.
      const versatzBisNaechsterRunde = teilweise ? taktMs : 0
      // Startzeit je noch unberührter Runde: fortlaufend ein Takt Abstand,
      // gerechnet ab jetzt (plus Versatz, falls eine Runde fortgesetzt wird).
      const startZeiten = new Map(
        unberuehrt.map((runde, index) => [
          runde.id,
          now + versatzBisNaechsterRunde + index * taktMs,
        ]),
      )
      // Sammelt nur die tatsächlich geänderten Läufe; nur sie werden
      // geschrieben, unberührte Runden kosten keinen Schreibvorgang.
      const geaendert: Lauf[] = []
      const naechste = laeufeRef.current.map((eintrag) => {
        const start = startZeiten.get(eintrag.id)
        if (start !== undefined) {
          // Der Wanduhr-Anker wird mitgezogen: Gemessen wird monoton, für
          // Verlauf und CSV braucht jeder Lauf aber eine echte Uhrzeit.
          const geplant = planeLauf(
            eintrag,
            start,
            wallNow + (start - now),
            satz.plan!.startversatzMs,
          )
          geaendert.push(geplant)
          return geplant
        }

        if (
          !betroffeneIds.has(eintrag.id) ||
          !eintrag.bahnen.some((bahn) => bahn.startMs === null && !isFinished(bahn))
        ) {
          return eintrag
        }

        // Angefangene Runde: nur fehlende Bahnen bekommen eine Startzeit,
        // ein bereits gesetzter Wanduhr-Anker bleibt erhalten.
        const ergaenzt: Lauf = {
          ...eintrag,
          startWallMs: eintrag.startWallMs ?? wallNow,
          bahnen: eintrag.bahnen.map((bahn) =>
            bahn.startMs === null && !isFinished(bahn)
              ? { ...bahn, startMs: now + (bahnReihe(bahn) - 1) * satz.plan!.startversatzMs }
              : bahn,
          ),
        }
        geaendert.push(ergaenzt)
        return ergaenzt
      })
      setLaeufe(naechste)
      for (const eintrag of geaendert) verfolge(() => saveLauf(eintrag))
      return
    }

    aktualisiereAktiven((eintrag) => startAll(eintrag, now, wallNow))
  }

  /**
   * Älteste offene, bereits gestartete Runde einer Bahn. Eine überholte Runde
   * wird also zuerst bedient, auch wenn eine neuere schon läuft.
   */
  function offeneRunde(
    runden: Lauf[],
    bahnIndex: number,
    now: number,
  ): { lauf: Lauf; bahn: Bahn } | null {
    const lauf = runden.find((runde) => {
      const bahn = runde.bahnen[bahnIndex]
      return bahn && bahn.startMs !== null && bahn.startMs <= now && !isFinished(bahn)
    })
    const bahn = lauf?.bahnen[bahnIndex]
    if (!lauf || !bahn) return null
    return { lauf, bahn }
  }

  /** Tap in der Serien-Ansicht: schließt die älteste offene Runde der Bahn. */
  function tippeSerie(bahnIndex: number, now: number, wallNow: number): void {
    if (!istAktiv()) return
    const serie = holeAktiveSerie()
    if (!serie) return
    const ziel = offeneRunde(serie.runden, bahnIndex, now)
    if (!ziel) return
    const schluessel = zeilenSchluessel(serie.lauf.id, bahnIndex, 'tippe')
    if (istDoppelterAbschluss(schluessel, ziel.lauf.id, now)) return
    const naechster = tapLane(ziel.lauf, ziel.bahn.id, now, wallNow)
    if (naechster === ziel.lauf) return
    aendereLauf(ziel.lauf, naechster)
    merkeAbschluss(schluessel, ziel.lauf.id, isComplete(naechster), now)
  }

  /** Setzt das Ziel in der Serien-Ansicht, mit derselben Auswahlregel wie `tippeSerie`. */
  function beendeSerie(bahnIndex: number, now: number, wallNow: number): void {
    if (!istAktiv()) return
    const serie = holeAktiveSerie()
    if (!serie) return
    const ziel = offeneRunde(serie.runden, bahnIndex, now)
    if (!ziel) return
    // Auch der Zielknopf liegt auf der Zeile; ein Doppelklick darf nicht die
    // nächste Runde mitbeenden.
    const schluessel = zeilenSchluessel(serie.lauf.id, bahnIndex, 'beende')
    if (istDoppelterAbschluss(schluessel, ziel.lauf.id, now)) return
    const naechster = finishLane(ziel.lauf, ziel.bahn.id, now, wallNow)
    if (naechster === ziel.lauf) return
    aendereLauf(ziel.lauf, naechster)
    merkeAbschluss(schluessel, ziel.lauf.id, isComplete(naechster), now)
  }

  /**
   * Nimmt den letzten Anschlag einer Bahn über alle Runden hinweg zurück.
   * Rückgängig trifft immer die zuletzt gemachte Eingabe.
   */
  function rueckgaengigSerie(bahnIndex: number): void {
    if (!istAktiv()) return
    const serie = holeAktiveSerie()
    if (!serie) return
    const treffer = letzterAnschlag(serie.runden, bahnIndex)
    if (!treffer) return
    // Eine bewusste Rücknahme beendet die Geste: Der nächste Tap darf sofort
    // wieder einen Anschlag setzen, auch wenn er im alten Zeitfenster liegt.
    letzterAbschluss = null
    aendereLauf(treffer.lauf, undoLane(treffer.lauf, treffer.bahn.id))
  }

  /**
   * Ordnet einer Bahn in allen Runden denselben Schwimmer zu. Die Zuordnung
   * gilt zeilenweise für die ganze Serie; gemessene Zeiten bleiben unberührt.
   */
  function setzeSchwimmerSerie(bahnIndex: number, schwimmerId: string | null): void {
    if (!istAktiv()) return
    const serie = holeAktiveSerie()
    if (!serie) return
    const geaendert: Lauf[] = []
    for (const runde of serie.runden) {
      const bahn = runde.bahnen[bahnIndex]
      if (!bahn) continue
      const naechster = setSchwimmerOnLane(runde, bahn.id, schwimmerId)
      if (naechster !== runde) {
        geaendert.push(naechster)
      }
    }
    if (geaendert.length === 0) return
    const nachId = new Map(geaendert.map((lauf) => [lauf.id, lauf]))
    setLaeufe(laeufeRef.current.map((lauf) => nachId.get(lauf.id) ?? lauf))
    for (const lauf of geaendert) verfolge(() => saveLauf(lauf))
  }

  /** Bahnzuordnung in einem beliebigen Lauf, etwa beim Nachtragen im Detail. */
  function setzeSchwimmerImLauf(
    laufId: string,
    bahnId: string,
    schwimmerId: string | null,
  ): void {
    if (!istAktiv()) return
    const lauf = laeufeRef.current.find((l) => l.id === laufId)
    if (!lauf) return
    const naechster = setSchwimmerOnLane(lauf, bahnId, schwimmerId)
    if (naechster === lauf) return
    setLaeufe(laeufeRef.current.map((l) => (l.id === laufId ? naechster : l)))
    verfolge(() => saveLauf(naechster))
  }

  /** Korrigiert einen erfassten Anschlag; die Domäne prüft die Reihenfolge. */
  function korrigiereAnschlag(
    laufId: string,
    bahnId: string,
    laengeNr: number,
    splitMs: number,
  ): void {
    if (!istAktiv()) return
    const lauf = laeufeRef.current.find((l) => l.id === laufId)
    if (!lauf) return
    const naechster = korrigiereAnschlagImLauf(lauf, bahnId, laengeNr, splitMs)
    if (naechster === lauf) return
    setLaeufe(laeufeRef.current.map((l) => (l.id === laufId ? naechster : l)))
    verfolge(() => saveLauf(naechster))
  }

  /**
   * Legt einen Lauf oder eine Serie an und macht ihn zum sichtbaren Eintrag.
   *
   * Ablauf: Eingaben prüfen, Satz bestimmen (Serie: neuer Satz mit Plan,
   * Einzellauf: passender Satz des Tages), Läufe anlegen, Leiste aufräumen.
   * Rückgabe ist die Anker-ID (erste Wiederholung) oder `null`.
   */
  function neuerLauf(
    konfiguration: LaufKonfiguration,
    bahnen: number,
    schwimmerProBahn: (string | null)[] = [],
    optionen: { startversatzMs?: number; wiederholungen?: number; taktSek?: number; reihen?: number } = {},
  ): string | null {
    if (!istAktiv()) return null
    if (validateKonfiguration(konfiguration) !== null) return null
    const einstellungen = getEinstellungen()
    const anzahlBahnen = Number.isFinite(bahnen)
      ? Math.min(MAX_BAHNEN, Math.max(1, Math.round(bahnen)))
      : STANDARD_EINSTELLUNGEN.bahnen
    const anzahlReihen = begrenzeReihen(optionen.reihen ?? einstellungen.reihen)
    const datum = heute()
    const startversatzMs = begrenzeVersatz(optionen.startversatzMs ?? einstellungen.startversatzMs)
    const wiederholungen = begrenzeWiederholungen(
      optionen.wiederholungen ?? einstellungen.wiederholungen,
    )
    const taktSek = begrenzeTakt(optionen.taktSek ?? einstellungen.taktSek)
    const geplanteSerie = wiederholungen > 1

    let satzId: string | null = null
    let neuerSatz: Satz | null = null
    if (geplanteSerie) {
      const satz: Satz = {
        id: newId(),
        datum,
        bezeichnung: '',
        konfiguration: { ...konfiguration },
        plan: { wiederholungen, taktSek, startversatzMs },
        erstelltAm: Date.now(),
      }
      satzId = satz.id
      neuerSatz = satz
      setSatze([satz, ...satzeRef.current])
    } else {
      // Einzelner Lauf: den letzten Satz desselben Tages mit gleicher
      // Konfiguration weiterverwenden, statt einen neuen anzulegen. `reverse`
      // sucht rückwärts, weil die Liste neueste Sätze vorn führt.
      const vorhandenerSatz = [...satzeRef.current]
        .reverse()
        .find(
          (satz) =>
            satz.datum === datum &&
            satz.plan === null &&
            !satz.wettkampfId &&
            gleicheKonfiguration(satz.konfiguration, konfiguration),
        )
      if (vorhandenerSatz) {
        satzId = vorhandenerSatz.id
      } else {
        const satz: Satz = {
          id: newId(),
          datum,
          bezeichnung: '',
          konfiguration: { ...konfiguration },
          plan: null,
          erstelltAm: Date.now(),
        }
        satzId = satz.id
        neuerSatz = satz
        setSatze([satz, ...satzeRef.current])
      }
    }

    // Personen werden Reihe für Reihe angelegt: erst alle Bahnen der Reihe 1,
    // dann Reihe 2. `nummer` ist die Bahn innerhalb ihrer Reihe.
    const gesamt = bahnenGesamt(anzahlBahnen, anzahlReihen)
    const bahnenInit = Array.from({ length: gesamt }, (_, i) => ({
      nummer: (i % anzahlBahnen) + 1,
      reihe: Math.floor(i / anzahlBahnen) + 1,
      schwimmerId: schwimmerProBahn[i] ?? null,
    }))
    // Bei einer Serie entstehen alle Wiederholungen sofort, aber noch ohne
    // Startzeit. `wiederholung` ordnet jede dem Satz zu; geplant wird erst
    // mit `startAlle`.
    const anzahl = geplanteSerie ? wiederholungen : 1
    const neueLaeufe = Array.from({ length: anzahl }, (_, index) =>
      createLauf(konfiguration, bahnenInit, satzId, {
        startversatzMs,
        wiederholung: geplanteSerie ? index + 1 : null,
      }),
    )

    setLaeufe([...neueLaeufe, ...laeufeRef.current])
    // Satz und Läufe gehören zusammen: Entweder ist der Lauf vollständig
    // angelegt oder gar nicht.
    verfolge(() => saveMehrere({ satze: neuerSatz ? [neuerSatz] : [], laeufe: neueLaeufe }))

    // Fertig gemessene Einträge verschwinden beim Anlegen aus der Leiste,
    // bleiben aber im Verlauf. Offene Läufe werden weitergeführt.
    const istEintragFertig = (laufId: string): boolean => {
      const eintrag = laeufeRef.current.find((lauf) => lauf.id === laufId)
      if (!eintrag) return true
      const satz = satzeRef.current.find((eintragSatz) => eintragSatz.id === eintrag.satzId)
      if (istSerie(satz) && satz) {
        return rundenVon(laeufeRef.current, satz.id).every(isComplete)
      }
      return isComplete(eintrag)
    }
    const behalten = aktiveIdsRef.current.filter((id) => !istEintragFertig(id))
    const anker = neueLaeufe[0]!
    setAktiveIds([anker.id, ...behalten])
    setAktivenLaufId(anker.id)
    return anker.id
  }

  /** Nimmt einen Lauf aus der Leiste, ohne Daten zu löschen. */
  function schliesseAktivenLauf(): void {
    if (!istAktiv()) return
    const id = aktiverLaufIdRef.current
    if (!id) return
    const naechste = aktiveIdsRef.current.filter((eintrag) => eintrag !== id)
    setAktiveIds(naechste)
    setAktivenLaufId(naechste[0] ?? null)
    zeigeToast('Lauf geschlossen.')
  }

  /**
   * Verwirft den sichtbaren Lauf samt Messwerten. Bei einer Serie werden alle
   * Runden und der Satz gelöscht — es gibt keine halbe Serie.
   */
  function verwerfeAktivenLauf(): void {
    if (!istAktiv()) return
    const id = aktiverLaufIdRef.current
    if (!id) return
    const lauf = laeufeRef.current.find((eintrag) => eintrag.id === id)
    const satz = lauf?.satzId
      ? satzeRef.current.find((eintrag) => eintrag.id === lauf.satzId)
      : undefined

    if (istSerie(satz) && satz) {
      const betroffen = rundenVon(laeufeRef.current, satz.id)
      const ids = new Set(betroffen.map((eintrag) => eintrag.id))
      setLaeufe(laeufeRef.current.filter((eintrag) => !ids.has(eintrag.id)))
      setSatze(satzeRef.current.filter((eintrag) => eintrag.id !== satz.id))
      const naechste = aktiveIdsRef.current.filter((eintrag) => !ids.has(eintrag))
      setAktiveIds(naechste)
      setAktivenLaufId(naechste[0] ?? null)
      verfolge(() => deleteSatzUndLaeufe(satz.id))
      zeigeToast('Serie abgebrochen.')
      return
    }

    setLaeufe(laeufeRef.current.filter((eintrag) => eintrag.id !== id))
    const naechste = aktiveIdsRef.current.filter((eintrag) => eintrag !== id)
    setAktiveIds(naechste)
    setAktivenLaufId(naechste[0] ?? null)
    verfolge(() => deleteLauf(id))

    const satzId = lauf?.satzId
    // Ein Satz ohne Läufe wäre im Verlauf unsichtbar; er verschwindet mit
    // seinem letzten Lauf.
    if (satzId && !laeufeRef.current.some((eintrag) => eintrag.satzId === satzId)) {
      setSatze(satzeRef.current.filter((eintrag) => eintrag.id !== satzId))
      verfolge(() => deleteSatzUndLaeufe(satzId))
    }
    zeigeToast('Lauf verworfen.')
  }

  /**
   * Löscht einen Lauf aus dem Verlauf. Die Leiste wird mitgepflegt; bei einer
   * Serie übernimmt die nächste verbliebene Wiederholung den Anker.
   */
  function loescheLauf(id: string): void {
    if (!istAktiv()) return
    const lauf = laeufeRef.current.find((eintrag) => eintrag.id === id)
    const satz = lauf?.satzId
      ? satzeRef.current.find((eintrag) => eintrag.id === lauf.satzId)
      : undefined
    const verbleibend = laeufeRef.current.filter((eintrag) => eintrag.id !== id)
    setLaeufe(verbleibend)
    verfolge(() => deleteLauf(id))

    // War der gelöschte Lauf der Anker einer Serie, übernimmt die nächste
    // verbliebene Wiederholung die Rolle in der Leiste.
    let naechsteAktive = aktiveIdsRef.current.filter((eintrag) => eintrag !== id)
    if (naechsteAktive.length !== aktiveIdsRef.current.length && istSerie(satz) && satz) {
      const rest = rundenVon(verbleibend, satz.id)
      if (rest.length > 0) naechsteAktive = [rest[0]!.id, ...naechsteAktive]
    }
    if (naechsteAktive.length !== aktiveIdsRef.current.length) {
      setAktiveIds(naechsteAktive)
      if (aktiverLaufIdRef.current === id) setAktivenLaufId(naechsteAktive[0] ?? null)
    }

    // Ein Satz ohne Läufe ist unsichtbar, aber nicht weg. Er verschwindet
    // mit seinem letzten Lauf.
    const satzId = lauf?.satzId
    if (satzId && !verbleibend.some((eintrag) => eintrag.satzId === satzId)) {
      setSatze(satzeRef.current.filter((eintrag) => eintrag.id !== satzId))
      verfolge(() => deleteSatzUndLaeufe(satzId))
    }
  }

  /** Löscht einen Satz mit allen seinen Läufen und bereinigt die Leiste. */
  function loescheSatz(id: string): void {
    if (!istAktiv()) return
    const betroffen = laeufeRef.current.filter((l) => l.satzId === id)
    setSatze(satzeRef.current.filter((s) => s.id !== id))
    setLaeufe(laeufeRef.current.filter((l) => l.satzId !== id))
    const ids = new Set(betroffen.map((lauf) => lauf.id))
    const naechste = aktiveIdsRef.current.filter((eintrag) => !ids.has(eintrag))
    setAktiveIds(naechste)
    if (betroffen.some((lauf) => lauf.id === aktiverLaufIdRef.current)) {
      setAktivenLaufId(naechste[0] ?? null)
    }
    verfolge(() => deleteSatzUndLaeufe(id))
  }

  /** Benennt einen Satz um; leerer Text entfernt die Bezeichnung. */
  function benenneSatz(id: string, bezeichnung: string): void {
    if (!istAktiv()) return
    const satz = satzeRef.current.find((eintrag) => eintrag.id === id)
    if (!satz) return
    const naechster = { ...satz, bezeichnung: bezeichnung.trim() }
    setSatze(satzeRef.current.map((eintrag) => (eintrag.id === id ? naechster : eintrag)))
    verfolge(() => saveSatz(naechster))
  }

  /**
   * Wählt einen bereits angelegten Satz aus, ohne gemessene Zeiten anzutasten.
   * Bevorzugt wird eine noch offene Runde, sonst die erste. Der alte Anker
   * derselben Serie wird aus der Leiste entfernt, damit sie dort nicht
   * zweimal erscheint.
   */
  function aktiviereSatz(satz: Satz): string | null {
    const runden = rundenVon(laeufeRef.current, satz.id)
    const kandidat = runden.find((lauf) => !isComplete(lauf)) ?? runden[0]
    if (!kandidat) return null
    const rundenIds = new Set(runden.map((lauf) => lauf.id))
    const behalten = aktiveIdsRef.current.filter((id) => !rundenIds.has(id))
    setAktiveIds([kandidat.id, ...behalten])
    setAktivenLaufId(kandidat.id)
    return kandidat.id
  }

  return {
    startAlle,
    tippe: (bahnId, now, wallNow) =>
      aktualisiereAktiven((l) => tapLane(l, bahnId, now, wallNow)),
    tippeSerie,
    beende: (bahnId, now, wallNow) =>
      aktualisiereAktiven((l) => finishLane(l, bahnId, now, wallNow)),
    beendeSerie,
    rueckgaengig: (bahnId) => aktualisiereAktiven((l) => undoLane(l, bahnId)),
    rueckgaengigSerie,
    setzeSchwimmer: (bahnId, schwimmerId) =>
      aktualisiereAktiven((l) => setSchwimmerOnLane(l, bahnId, schwimmerId)),
    setzeSchwimmerSerie,
    setzeSchwimmerImLauf,
    korrigiereAnschlag,
    setzeKonfiguration: (konfiguration) =>
      aktualisiereAktiven((l) => updateStrecke(l, konfiguration)),
    neuerLauf,
    anlegenLauf: () => {
      const werte = getEinstellungen()
      neuerLauf(werte.konfiguration, werte.bahnen, werte.schwimmerProBahn, {
        startversatzMs: werte.startversatzMs,
        wiederholungen: werte.wiederholungen,
        taktSek: werte.taktSek,
        reihen: werte.reihen,
      })
    },
    waehleLauf: (id) => {
      if (!aktiveIdsRef.current.includes(id)) return
      setAktivenLaufId(id)
    },
    schliesseAktivenLauf,
    verwerfeAktivenLauf,
    loescheLauf,
    loescheSatz,
    benenneSatz,
    aktiviereSatz,
    aendereLauf,
  }
}
