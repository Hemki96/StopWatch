/**
 * Trainingsplan: Aktive je Bahn und Sätze in fester Reihenfolge.
 *
 * Ein `Training` ist nur Vorbereitung. Es enthält keine Messungen, sondern
 * `TrainingsSatz`-Pläne und die Zuordnung `gestartet` von Trainingssatz-ID zu
 * der ID des daraus entstandenen `Satz`. Erst beim Start entstehen Satz und
 * Läufe (ADR 0007); gemessene Zeiten werden nie aus dem Plan neu berechnet.
 *
 * Der Fortschritt wird vollständig aus `satze` und `laeufe` abgeleitet, damit
 * kein zusätzlicher Status nach einem Reload oder einer Löschung hängen bleibt.
 * Gestartete Sätze sind fest: Diese Datei erzwingt das nicht selbst, sondern
 * liefert mit `trainingsFortschritt` die Grundlage, auf der die Oberfläche nur
 * noch offene Sätze zum Bearbeiten freigibt.
 *
 * Die Grenzen stehen hier, weil Domain, Backup-Prüfung und Oberfläche dieselben
 * Werte verwenden sollen.
 */

import { isComplete, validateKonfiguration } from './lauf'
import { formatStrecke, formatTakt } from './format'
import { newId } from './id'
import {
  SCHWIMMARTEN,
  type Lauf,
  type LaufKonfiguration,
  type Satz,
  type Training,
  type TrainingsSatz,
} from './types'

/** Höchstzahl der Sätze in einem Training (auch für die Backup-Prüfung). */
export const MAX_TRAININGS_SAETZE = 20
/** Höchstzahl der Wiederholungen eines Trainingssatzes. */
export const MAX_WIEDERHOLUNGEN = 20
/** Höchstzahl der Bahnen in einem Lauf und in einem Training. */
export const MAX_BAHNEN = 10

/** Vorgabe für einen neuen Trainingssatz, wenn nichts anderes gewählt wurde. */
const STANDARD_SAETZ_KONFIGURATION: LaufKonfiguration = {
  beckenlaengeM: 50,
  streckeM: 100,
  schwimmart: 'freistil',
}

/**
 * Ein neuer, noch nicht gespeicherter Satz für die Vorbereitung.
 *
 * Alle Felder lassen sich über `teil` vorbelegen (z. B. beim Kopieren eines
 * Satzes); fehlende Werte bekommen die Vorgaben. Eine neue ID entsteht nur,
 * wenn keine mitgegeben wurde.
 */
export function neuerTrainingsSatz(teil: Partial<TrainingsSatz> = {}): TrainingsSatz {
  return {
    id: teil.id ?? newId(),
    bezeichnung: teil.bezeichnung ?? '',
    konfiguration: { ...(teil.konfiguration ?? STANDARD_SAETZ_KONFIGURATION) },
    wiederholungen: teil.wiederholungen ?? 1,
    taktSek: teil.taktSek ?? 120,
    startversatzMs: teil.startversatzMs ?? 0,
  }
}

/**
 * Legt ein neues Training an.
 *
 * `bahnen` wird auf 1..10 geklemmt und gerundet, damit die Grenze auch bei
 * freien Eingaben aus einem Formular hält. `aktive` bekommt genau einen Platz
 * pro Bahn (fehlende werden `null`), es gibt immer mindestens einen Satz,
 * `gestartet` startet leer und `erstelltAm` ist die aktuelle Wanduhr.
 */
export function neuesTraining(daten: {
  datum: string
  bezeichnung?: string
  bahnen: number
  aktive?: (string | null)[]
  saetze?: TrainingsSatz[]
}): Training {
  // Klemmt auch `NaN`: `Number.isFinite` schlägt dann fehl und es bleibt bei 1.
  const bahnen = Number.isFinite(daten.bahnen)
    ? Math.min(MAX_BAHNEN, Math.max(1, Math.round(daten.bahnen)))
    : 1
  return {
    id: newId(),
    datum: daten.datum,
    bezeichnung: daten.bezeichnung?.trim() ?? '',
    bahnen,
    // Zu lange Listen werden abgeschnitten, zu kurze mit `null` aufgefüllt.
    aktive: Array.from({ length: bahnen }, (_, index) => daten.aktive?.[index] ?? null),
    saetze: daten.saetze?.length ? daten.saetze : [neuerTrainingsSatz()],
    gestartet: {},
    erstelltAm: Date.now(),
  }
}

/**
 * Die Kurzbeschreibung eines Satzes aus Strecke, Wiederholungen und Schwimmart,
 * z. B. „4×100 m · Freistil“. Bei einer Wiederholung entfällt das „n×“.
 */
export function beschreibeTrainingsSatz(satz: TrainingsSatz): string {
  const strecke = formatStrecke(satz.konfiguration.streckeM)
  const art = SCHWIMMARTEN.find((eintrag) => eintrag.wert === satz.konfiguration.schwimmart)?.label
  const distanz = satz.wiederholungen > 1 ? `${satz.wiederholungen}×${strecke}` : strecke
  return art ? `${distanz} · ${art}` : distanz
}

/**
 * Titel einer Zeile: eigene Bezeichnung (getrimmt), sonst die Kurzbeschreibung.
 * Eine leere Bezeichnung ist damit kein Sonderfall für die Anzeige.
 */
export function trainingsSatzTitel(satz: TrainingsSatz): string {
  return satz.bezeichnung.trim() || beschreibeTrainingsSatz(satz)
}

/**
 * Die ruhige Metazeile unter dem Titel: Beckenlänge immer, Takt nur bei
 * mehreren Wiederholungen, Startversatz nur wenn er größer als 0 ist. Der
 * Versatz wird für die Anzeige auf ganze Sekunden gerundet.
 */
export function trainingsSatzMeta(satz: TrainingsSatz): string {
  const teile = [`${satz.konfiguration.beckenlaengeM} m-Becken`]
  if (satz.wiederholungen > 1) teile.push(`Takt ${formatTakt(satz.taktSek)}`)
  if (satz.startversatzMs > 0) teile.push(`${Math.round(satz.startversatzMs / 1000)} s Versatz`)
  return teile.join(' · ')
}

/**
 * Prüft einen Trainingssatz und liefert eine deutsche Meldung oder `null`.
 *
 * Ein einzelner Lauf (`wiederholungen: 1`) ist erlaubt; erst ab zwei
 * Wiederholungen ist es eine Serie. Takt (1 s bis 60 Minuten) und Startversatz
 * (0 bis 120 s) werden unabhängig von der Wiederholungszahl geprüft.
 */
export function pruefeTrainingsSatz(satz: TrainingsSatz): string | null {
  const konfiguration = validateKonfiguration(satz.konfiguration)
  if (konfiguration !== null) return konfiguration
  if (
    !Number.isInteger(satz.wiederholungen) ||
    satz.wiederholungen < 1 ||
    satz.wiederholungen > MAX_WIEDERHOLUNGEN
  ) {
    return `Wiederholungen müssen zwischen 1 und ${MAX_WIEDERHOLUNGEN} liegen.`
  }
  if (!Number.isFinite(satz.taktSek) || satz.taktSek <= 0 || satz.taktSek > 3600) {
    return 'Der Takt muss zwischen 1 s und 60 Minuten liegen.'
  }
  if (
    !Number.isFinite(satz.startversatzMs) ||
    satz.startversatzMs < 0 ||
    satz.startversatzMs > 120_000
  ) {
    return 'Der Startversatz muss zwischen 0 s und 120 s liegen.'
  }
  return null
}

/**
 * Prüft ein ganzes Training vor dem Speichern.
 *
 * Geprüft werden ID, Datumsformat `JJJJ-MM-TT`, Bahnenzahl, genau ein Platz je
 * Bahn in `aktive`, 1..20 Sätze und jeder einzelne Satz. Nicht geprüft werden
 * doppelte Satz-IDs und unbekannte `gestartet`-Werte; eine verwaiste Zuordnung
 * gilt beim Fortschritt bewusst wieder als „offen“.
 */
export function pruefeTraining(training: Training): string | null {
  if (!training.id) return 'Dem Training fehlt eine ID.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(training.datum)) {
    return 'Das Datum muss im Format JJJJ-MM-TT vorliegen.'
  }
  if (
    !Number.isInteger(training.bahnen) ||
    training.bahnen < 1 ||
    training.bahnen > MAX_BAHNEN
  ) {
    return `Ein Training braucht 1 bis ${MAX_BAHNEN} Bahnen.`
  }
  if (training.aktive.length !== training.bahnen) {
    return 'Für jede Bahn muss genau ein Platz in den Aktiven vorgesehen sein.'
  }
  if (training.aktive.some((wert) => wert !== null && typeof wert !== 'string')) {
    return 'Die Aktiven dürfen nur Schwimmer-IDs oder null enthalten.'
  }
  if (training.saetze.length === 0) return 'Ein Training braucht mindestens einen Satz.'
  if (training.saetze.length > MAX_TRAININGS_SAETZE) {
    return `Ein Training darf höchstens ${MAX_TRAININGS_SAETZE} Sätze enthalten.`
  }
  for (const satz of training.saetze) {
    const fehler = pruefeTrainingsSatz(satz)
    if (fehler) return fehler
  }
  return null
}

/**
 * Ersetzt den Satz mit derselben ID; die Position in der Reihenfolge bleibt.
 * Eine unbekannte ID fügt nichts hinzu. Ob der Satz noch geändert werden darf,
 * entscheidet der Aufrufer anhand des Fortschritts.
 */
export function ersetzeTrainingsSatz(training: Training, satz: TrainingsSatz): Training {
  return {
    ...training,
    saetze: training.saetze.map((eintrag) => (eintrag.id === satz.id ? satz : eintrag)),
  }
}

/**
 * Entfernt einen Satz aus der Reihenfolge. Die Mindestzahl von einem Satz wird
 * hier nicht erzwungen, das prüft die Oberfläche vor dem Aufruf.
 */
export function ohneTrainingsSatz(training: Training, satzId: string): Training {
  return {
    ...training,
    saetze: training.saetze.filter((eintrag) => eintrag.id !== satzId),
  }
}

/**
 * Verschiebt einen Satz um eine Position. Am Rand bleibt die Reihenfolge gleich.
 *
 * `splice` entfernt zuerst und fügt an der Zielposition wieder ein; dadurch
 * stimmt der Zielindex auch beim Verschieben nach hinten. Unbekannte IDs und
 * Ränder liefern dasselbe Training zurück.
 */
export function verschiebeTrainingsSatz(
  training: Training,
  satzId: string,
  richtung: -1 | 1,
): Training {
  const index = training.saetze.findIndex((eintrag) => eintrag.id === satzId)
  const ziel = index + richtung
  if (index === -1 || ziel < 0 || ziel >= training.saetze.length) return training
  const saetze = [...training.saetze]
  const [satz] = saetze.splice(index, 1)
  if (!satz) return training
  saetze.splice(ziel, 0, satz)
  return { ...training, saetze }
}

/**
 * Zustand eines Trainingssatzes, abgeleitet aus den vorhandenen Läufen:
 * `offen` = noch kein Satz angelegt, `bereit` = angelegt und unberührt,
 * `laeuft` = mindestens eine Bahn gestartet oder mit Anschlag,
 * `fertig` = alle Läufe vollständig.
 */
export type TrainingsSatzStatus = 'offen' | 'bereit' | 'laeuft' | 'fertig'

/** Ein Trainingssatz mit seinem abgeleiteten Fortschritt für die Anzeige. */
export interface TrainingsSatzFortschritt {
  eintrag: TrainingsSatz
  /** Position in der festen Reihenfolge des Trainings, 0-basiert. */
  index: number
  status: TrainingsSatzStatus
  /** Der aus diesem Satz entstandene Satz, sobald er gestartet wurde. */
  satz: Satz | null
  laeufe: Lauf[]
  /** Anzahl der Runden, in denen alle Bahnen im Ziel sind. */
  fertigeRunden: number
}

/**
 * Leitet den Status aus den Läufen eines Satzes ab.
 *
 * Ohne Läufe ist der Satz „offen“ (noch nicht gestartet). Sind alle Läufe
 * vollständig, ist er „fertig“. Sonst entscheidet, ob irgendeine Bahn schon
 * einen Start oder Anschlag hat: dann „laeuft“, andernfalls „bereit“.
 */
function statusVon(laeufe: Lauf[]): TrainingsSatzStatus {
  if (laeufe.length === 0) return 'offen'
  if (laeufe.every(isComplete)) return 'fertig'
  const beruehrt = laeufe.some(
    (lauf) =>
      lauf.bahnen.some((bahn) => bahn.startMs !== null) ||
      lauf.bahnen.some((bahn) => bahn.anschlaege.length > 0),
  )
  return beruehrt ? 'laeuft' : 'bereit'
}

/**
 * Der Fortschritt eines Trainings wird aus den tatsächlich angelegten Sätzen
 * und Läufen abgeleitet. Es gibt keinen zusätzlichen Status, der nach einem
 * Reload oder einer Löschung aus dem Takt geraten könnte.
 *
 * Reihenfolge und Anzahl der Einträge entsprechen `training.saetze`. Eine
 * Zuordnung in `gestartet`, deren Satz nicht mehr existiert, wird wie ein noch
 * nicht gestarteter Satz behandelt (`satz: null`, Status `offen`).
 */
export function trainingsFortschritt(
  training: Training,
  satze: Satz[],
  laeufe: Lauf[],
): TrainingsSatzFortschritt[] {
  const satzNachId = new Map(satze.map((eintrag) => [eintrag.id, eintrag]))
  return training.saetze.map((eintrag, index) => {
    const satzId = training.gestartet[eintrag.id]
    const satz = satzId ? (satzNachId.get(satzId) ?? null) : null
    const runden = satz ? laeufe.filter((lauf) => lauf.satzId === satz.id) : []
    return {
      eintrag,
      index,
      status: statusVon(runden),
      satz,
      laeufe: runden,
      fertigeRunden: runden.filter(isComplete).length,
    }
  })
}

/** Zählt fertige und alle Sätze für die Kopfzeile des Trainings. */
export function trainingZusammenfassung(fortschritt: TrainingsSatzFortschritt[]): {
  fertig: number
  gesamt: number
} {
  return {
    fertig: fortschritt.filter((eintrag) => eintrag.status === 'fertig').length,
    gesamt: fortschritt.length,
  }
}

/**
 * Der Satz, den der Trainer als Nächstes braucht: zuerst ein bereits laufender
 * oder angelegter, sonst der erste noch offene. `null` heißt: alles erledigt.
 *
 * Innerhalb desselben Status entscheidet die feste Reihenfolge des Trainings.
 * Ein laufender Satz hat Vorrang vor einem früheren offenen, weil der Trainer am
 * Beckenrand dort weitermacht, wo gerade gemessen wird.
 */
export function naechsterSatz(
  fortschritt: TrainingsSatzFortschritt[],
): TrainingsSatzFortschritt | null {
  return (
    fortschritt.find(
      (eintrag) => eintrag.status === 'laeuft' || eintrag.status === 'bereit',
    ) ??
    fortschritt.find((eintrag) => eintrag.status === 'offen') ??
    null
  )
}
