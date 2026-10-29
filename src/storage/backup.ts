/**
 * Prüfung und Format des JSON-Backups.
 *
 * Ein Backup ist ein einzelnes JSON-Objekt mit Formatkennung, Version,
 * Exportzeitpunkt und den fünf Beständen. `pruefeBackup` validiert es
 * vollständig, bevor `repository.importBackup` irgendetwas schreibt; die
 * Rückgabe enthält entweder das typisierte Backup samt Zählung oder eine
 * Fehlermeldung mit Pfad zum ersten konkreten Problem.
 *
 * Datenfluss: `SettingsScreen` liest die Datei, parst das JSON und lässt den
 * Inhalt über `app/daten.ts` prüfen; erst nach Bestätigung geht dasselbe Objekt
 * an den Provider (`importiereBackup`) und von dort an `importBackup`, das
 * erneut prüft.
 *
 * Zentrale Invarianten:
 * - Jede Version von 1 bis `BACKUP_VERSION` bleibt einlesbar. Neuere
 *   Sammlungen (`wettkampfe`, `trainings`) sind optional und werden für ältere
 *   Stände als leere Liste ergänzt.
 * - Geprüft werden Struktur, Typen und Wertebereiche, nicht die referenzielle
 *   Integrität zwischen den Beständen (etwa ob eine `satzId` existiert).
 * - Die Prüfung verändert die Eingabe nicht.
 */
import {
  MAX_BAHNEN,
  MAX_REIHEN,
  MAX_TRAININGS_SAETZE,
  MAX_WIEDERHOLUNGEN,
  bahnenGesamt,
} from '../domain/training'
import { istVielfacheDerBeckenlaenge } from '../domain/lauf'
import {
  SCHWIMMARTEN,
  type Lauf,
  type Satz,
  type Schwimmer,
  type Training,
  type Wettkampf,
} from '../domain/types'

/**
 * Obergrenzen für die Backup-Prüfung. Sie liegen bewusst deutlich über dem,
 * was die App in einem realistischen Trainingsleben erzeugt, verhindern aber,
 * dass eine präparierte oder versehentlich riesige Datei den Hauptthread und
 * die IndexedDB-Transaktion blockiert. Die Werte sind Teil des Formats: Wer sie
 * erhöht, muss ältere Backups weiterhin lesen können.
 */
const MAX_SCHWIMMER = 10_000
const MAX_SATZE = 10_000
const MAX_LAEUFE = 100_000
const MAX_WETTKAMPFE = 2_000
const MAX_TRAININGS = 2_000
const MAX_ANSCHLAEGE_PRO_BAHN = 1_000
const MAX_TEXTLAENGE = 10_000

/** Formatkennung im Feld `format`; grenzt Backups von fremden JSON-Dateien ab. */
export const BACKUP_FORMAT = 'beckenrand-backup'
/** Aktuelle Version, die `exportBackup` schreibt. */
export const BACKUP_VERSION = 3
/** Version 1 kannte keine Wettkämpfe, Version 2 keine Trainings. Beide bleiben einlesbar. */
const BACKUP_VERSIONEN = [1, 2, 3] as const

/** Versionen, die `pruefeBackup` akzeptiert. */
export type BackupVersion = (typeof BACKUP_VERSIONEN)[number]

/**
 * Vollständiger Inhalt einer Backup-Datei.
 *
 * `format` und `version` identifizieren das Format, `exportiertAm` ist ein
 * ISO-Zeitstempel. Die übrigen Felder sind die Bestände in der Reihenfolge, in
 * der `repository.exportBackup` sie liefert.
 */
export interface Backup {
  format: typeof BACKUP_FORMAT
  version: BackupVersion
  exportiertAm: string
  schwimmer: Schwimmer[]
  satze: Satz[]
  laeufe: Lauf[]
  wettkampfe: Wettkampf[]
  trainings: Training[]
}

/** Anzahl der Datensätze je Bestand, für die Import-Vorschau. */
export interface BackupZusammenfassung {
  schwimmer: number
  satze: number
  laeufe: number
  wettkampfe: number
  trainings: number
}

/**
 * Der lokal vorhandene Bestand, gegen den ein Import geprüft wird. Die Form
 * entspricht den Listen eines Backups ohne Hülle; so lässt sich derselbe
 * Vergleich für Vorschau und Schreiben verwenden.
 */
export interface BackupBestand {
  schwimmer: Schwimmer[]
  satze: Satz[]
  laeufe: Lauf[]
  wettkampfe: Wettkampf[]
  trainings: Training[]
}

/**
 * Warum ein Datensatz als Konflikt gilt.
 *
 * `lokalNeuer` heißt: Der lokale Stand ist nachweislich weiter (mehr
 * Anschläge, späterer Start, später erfasst oder später angelegt).
 * `abweichend` heißt: Der Inhalt unterscheidet sich, ohne dass der lokale
 * Stand eindeutig neuer ist.
 */
export type KonfliktArt = 'lokalNeuer' | 'abweichend'

/** Eine Kollision zwischen einem Backup-Datensatz und dem lokalen Bestand. */
export interface BackupKonflikt {
  bestand: keyof BackupBestand
  id: string
  art: KonfliktArt
}

/** Ergebnis der Konfliktprüfung; `neuereLokale` zählt nur `lokalNeuer`. */
export interface BackupKonflikte {
  eintraege: BackupKonflikt[]
  gesamt: number
  neuereLokale: number
}

/**
 * Entscheidung für den Import. `lokalBehalten` ist der Standard: Kollidierende
 * Datensätze werden übersprungen. `backupErsetzen` schreibt sie bewusst.
 */
export type KonfliktAufloesung = 'lokalBehalten' | 'backupErsetzen'

/**
 * Ergebnis der Backup-Prüfung.
 *
 * Bei Erfolg stehen das typisierte Backup und die Zählung bereit; bei einem
 * Fehler nur eine deutsche Meldung, die den Pfad des ersten Problems nennt.
 * Aufrufer müssen `ok` prüfen, bevor sie `backup` verwenden.
 */
export type BackupPruefung =
  | { ok: true; backup: Backup; zusammenfassung: BackupZusammenfassung }
  | { ok: false; fehler: string }

/**
 * Typprüfung für JSON-Werte: echtes Objekt, kein Array und nicht null.
 * Nur so lassen sich Felder gefahrlos per Punktnotation lesen.
 */
function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert)
}

/** Typprüfung für Zeichenketten. */
function istText(wert: unknown): wert is string {
  return typeof wert === 'string'
}

/** Typprüfung für endliche Zahlen; schließt NaN und Infinity aus JSON aus. */
function istZahl(wert: unknown): wert is number {
  return typeof wert === 'number' && Number.isFinite(wert)
}

/** Typprüfung für nicht negative ganze Zahlen (Indizes, Nummern, Zähler). */
function istIndex(wert: unknown): wert is number {
  return Number.isInteger(wert) && (wert as number) >= 0
}

/**
 * Prüft die Laufkonfiguration, die in Sätzen, Trainingssätzen und Läufen
 * vorkommt: Beckenlänge 25 oder 50, Strecke positiv oder null (offene Strecke),
 * Schwimmart aus der festen Liste.
 */
function pruefeKonfiguration(wert: unknown, pfad: string): string | null {
  if (!istObjekt(wert)) return `${pfad}: Die Konfiguration fehlt oder ist kein Objekt.`
  if (wert.beckenlaengeM !== 25 && wert.beckenlaengeM !== 50 && wert.beckenlaengeM !== 22.86) {
    return `${pfad}: Feld "beckenlaengeM" muss 25, 50 oder 22.86 sein.`
  }
  if (wert.einheit !== undefined && wert.einheit !== 'm' && wert.einheit !== 'yd') {
    return `${pfad}: Feld "einheit" muss "m", "yd" oder leer sein.`
  }
  if (wert.streckeM !== null && (!istZahl(wert.streckeM) || wert.streckeM <= 0)) {
    return `${pfad}: Feld "streckeM" muss eine positive Zahl oder null sein.`
  }
  // Eine Strecke, die kein Vielfaches der Beckenlänge ist, würde später eine
  // krumme Längenzahl und damit falsche Splits erzeugen.
  if (
    typeof wert.streckeM === 'number' &&
    typeof wert.beckenlaengeM === 'number' &&
    !istVielfacheDerBeckenlaenge(wert.streckeM, wert.beckenlaengeM)
  ) {
    return `${pfad}: Feld "streckeM" muss ein Vielfaches der Beckenlänge sein.`
  }
  if (!SCHWIMMARTEN.some((art) => art.wert === wert.schwimmart)) {
    return `${pfad}: Feld "schwimmart" enthält einen unbekannten Wert.`
  }
  return null
}

/**
 * Prüft einen Schwimmer-Eintrag. `id` und `name` dürfen nicht leer sein,
 * `jahrgang` darf null sein, `notiz` muss vorhanden (auch leer), `erstelltAm`
 * eine endliche Zahl.
 */
function pruefeSchwimmer(wert: unknown, index: number): string | null {
  const pfad = `Schwimmer ${index + 1}`
  if (!istObjekt(wert)) return `${pfad}: Eintrag ist kein Objekt.`
  if (!istText(wert.id) || wert.id.length === 0) return `${pfad}: Feld "id" fehlt.`
  if (!istText(wert.name) || wert.name.trim().length === 0) {
    return `${pfad}: Feld "name" fehlt oder ist leer.`
  }
  if (wert.name.length > MAX_TEXTLAENGE) {
    return `${pfad}: Feld "name" ist länger als ${MAX_TEXTLAENGE} Zeichen.`
  }
  if (wert.jahrgang !== null && !istZahl(wert.jahrgang)) {
    return `${pfad}: Feld "jahrgang" muss eine Zahl oder null sein.`
  }
  if (!istText(wert.notiz)) return `${pfad}: Feld "notiz" fehlt.`
  if (wert.notiz.length > MAX_TEXTLAENGE) {
    return `${pfad}: Feld "notiz" ist länger als ${MAX_TEXTLAENGE} Zeichen.`
  }
  if (!istZahl(wert.erstelltAm)) return `${pfad}: Feld "erstelltAm" fehlt oder ist keine Zahl.`
  return null
}

/**
 * Prüft einen Wettkampf-Eintrag: Name, Datum im Muster `JJJJ-MM-TT`, gültige
 * Beckenlänge und Erstellungszeit. Ob Disziplinen auf ihn verweisen, wird hier
 * nicht geprüft.
 */
function pruefeWettkampf(wert: unknown, index: number): string | null {
  const pfad = `Wettkampf ${index + 1}`
  if (!istObjekt(wert)) return `${pfad}: Eintrag ist kein Objekt.`
  if (!istText(wert.id) || wert.id.length === 0) return `${pfad}: Feld "id" fehlt.`
  if (!istText(wert.name) || wert.name.trim().length === 0) {
    return `${pfad}: Feld "name" fehlt oder ist leer.`
  }
  if (!istText(wert.datum) || !/^\d{4}-\d{2}-\d{2}$/.test(wert.datum)) {
    return `${pfad}: Feld "datum" muss ein Datum im Format JJJJ-MM-TT sein.`
  }
  if (wert.beckenlaengeM !== 25 && wert.beckenlaengeM !== 50 && wert.beckenlaengeM !== 22.86) {
    return `${pfad}: Feld "beckenlaengeM" muss 25, 50 oder 22.86 sein.`
  }
  if (wert.einheit !== undefined && wert.einheit !== 'm' && wert.einheit !== 'yd') {
    return `${pfad}: Feld "einheit" muss "m", "yd" oder leer sein.`
  }
  if (!istZahl(wert.erstelltAm)) return `${pfad}: Feld "erstelltAm" fehlt oder ist keine Zahl.`
  return null
}

/**
 * Prüft einen Trainingssatz (nur Plan, keine Messdaten). Die Wiederholungen
 * liegen zwischen 1 und `MAX_WIEDERHOLUNGEN` — anders als beim Serienplan ist
 * eine einzelne Wiederholung hier erlaubt. Takt und Startversatz müssen positiv
 * bzw. nicht negativ und nach oben begrenzt sein.
 */
function pruefeTrainingsSatz(wert: unknown, pfad: string): string | null {
  if (!istObjekt(wert)) return `${pfad}: Eintrag ist kein Objekt.`
  if (!istText(wert.id) || wert.id.length === 0) return `${pfad}: Feld "id" fehlt.`
  if (!istText(wert.bezeichnung)) return `${pfad}: Feld "bezeichnung" fehlt.`
  const konfiguration = pruefeKonfiguration(wert.konfiguration, `${pfad}, Konfiguration`)
  if (konfiguration) return konfiguration
  if (
    !istIndex(wert.wiederholungen) ||
    wert.wiederholungen < 1 ||
    wert.wiederholungen > MAX_WIEDERHOLUNGEN
  ) {
    return `${pfad}: Feld "wiederholungen" muss eine ganze Zahl von 1 bis ${MAX_WIEDERHOLUNGEN} sein.`
  }
  if (!istZahl(wert.taktSek) || wert.taktSek <= 0 || wert.taktSek > 3600) {
    return `${pfad}: Feld "taktSek" muss zwischen 1 und 3600 liegen.`
  }
  if (!istZahl(wert.startversatzMs) || wert.startversatzMs < 0 || wert.startversatzMs > 120_000) {
    return `${pfad}: Feld "startversatzMs" muss zwischen 0 und 120000 liegen.`
  }
  return null
}

/**
 * Prüft einen Trainingsplan.
 *
 * `bahnen` (je Reihe) muss zwischen 1 und 10 liegen (die Obergrenze entspricht
 * `MAX_BAHNEN`), `reihen` optional zwischen 1 und `MAX_REIHEN` (ältere Backups
 * kennen das Feld nicht und gelten als eine Reihe), `aktive` genau einen Text-
 * oder null-Eintrag je Person haben, `saetze` zwischen 1 und
 * `MAX_TRAININGS_SAETZE` Pläne enthalten. `gestartet` ist die Zuordnung
 * TrainingsSatz.id → Satz.id und darf nur Textwerte tragen. Die Reihenfolge der
 * Sätze bleibt erhalten, weil sie den Ablauf bestimmt.
 */
function pruefeTraining(wert: unknown, index: number): string | null {
  const pfad = `Training ${index + 1}`
  if (!istObjekt(wert)) return `${pfad}: Eintrag ist kein Objekt.`
  if (!istText(wert.id) || wert.id.length === 0) return `${pfad}: Feld "id" fehlt.`
  if (!istText(wert.datum) || !/^\d{4}-\d{2}-\d{2}$/.test(wert.datum)) {
    return `${pfad}: Feld "datum" muss ein Datum im Format JJJJ-MM-TT sein.`
  }
  if (!istText(wert.bezeichnung)) return `${pfad}: Feld "bezeichnung" fehlt.`
  if (!istIndex(wert.bahnen) || wert.bahnen < 1 || wert.bahnen > 10) {
    return `${pfad}: Feld "bahnen" muss eine ganze Zahl von 1 bis 10 sein.`
  }
  if (
    wert.reihen !== undefined &&
    (!istIndex(wert.reihen) || wert.reihen < 1 || wert.reihen > MAX_REIHEN)
  ) {
    return `${pfad}: Feld "reihen" muss eine ganze Zahl von 1 bis ${MAX_REIHEN} sein.`
  }
  const reihen = wert.reihen ?? 1
  if (!Array.isArray(wert.aktive) || wert.aktive.length !== bahnenGesamt(wert.bahnen, reihen)) {
    return `${pfad}: Feld "aktive" muss genau einen Eintrag je Person enthalten.`
  }
  if (wert.aktive.some((eintrag) => eintrag !== null && !istText(eintrag))) {
    return `${pfad}: Feld "aktive" darf nur Text oder null enthalten.`
  }
  if (!Array.isArray(wert.saetze) || wert.saetze.length === 0) {
    return `${pfad}: Feld "saetze" muss mindestens einen Satz enthalten.`
  }
  if (wert.saetze.length > MAX_TRAININGS_SAETZE) {
    return `${pfad}: Feld "saetze" darf höchstens ${MAX_TRAININGS_SAETZE} Sätze enthalten.`
  }
  for (const [i, satz] of wert.saetze.entries()) {
    const fehler = pruefeTrainingsSatz(satz, `${pfad}, Satz ${i + 1}`)
    if (fehler) return fehler
  }
  if (!istObjekt(wert.gestartet)) {
    return `${pfad}: Feld "gestartet" muss ein Objekt sein.`
  }
  if (!Object.values(wert.gestartet).every((eintrag) => istText(eintrag))) {
    return `${pfad}: Feld "gestartet" darf nur Satz-IDs enthalten.`
  }
  if (!istZahl(wert.erstelltAm)) return `${pfad}: Feld "erstelltAm" fehlt oder ist keine Zahl.`
  return null
}

/**
 * Prüft den Plan einer Serie. Anders als bei einem Trainingssatz sind hier
 * mindestens zwei Wiederholungen nötig: Eine Serie mit einer Wiederholung wäre
 * ein einzelner Lauf ohne Takt.
 */
function pruefeSatzPlan(wert: unknown, pfad: string): string | null {
  if (!istObjekt(wert)) return `${pfad}: Der Plan ist kein Objekt.`
  if (
    !istIndex(wert.wiederholungen) ||
    wert.wiederholungen < 2 ||
    wert.wiederholungen > MAX_WIEDERHOLUNGEN
  ) {
    return `${pfad}: Feld "wiederholungen" muss eine ganze Zahl von 2 bis ${MAX_WIEDERHOLUNGEN} sein.`
  }
  if (!istZahl(wert.taktSek) || wert.taktSek <= 0 || wert.taktSek > 3600) {
    return `${pfad}: Feld "taktSek" muss zwischen 1 und 3600 liegen.`
  }
  if (!istZahl(wert.startversatzMs) || wert.startversatzMs < 0 || wert.startversatzMs > 120_000) {
    return `${pfad}: Feld "startversatzMs" muss zwischen 0 und 120000 liegen.`
  }
  return null
}

/**
 * Prüft einen Satz (Trainingssatz oder Wettkampf-Disziplin).
 *
 * `wettkampfId` und `plan` sind optional, weil ältere Backups sie nicht
 * enthalten; fehlende Werte werden später von `normalizeSatzOnLoad` ergänzt.
 * `datum` muss dem Muster `JJJJ-MM-TT` entsprechen, die Konfiguration gültig.
 */
function pruefeSatz(wert: unknown, index: number): string | null {
  const pfad = `Satz ${index + 1}`
  if (!istObjekt(wert)) return `${pfad}: Eintrag ist kein Objekt.`
  if (!istText(wert.id) || wert.id.length === 0) return `${pfad}: Feld "id" fehlt.`
  if (!istText(wert.datum) || !/^\d{4}-\d{2}-\d{2}$/.test(wert.datum)) {
    return `${pfad}: Feld "datum" muss ein Datum im Format JJJJ-MM-TT sein.`
  }
  if (!istText(wert.bezeichnung)) return `${pfad}: Feld "bezeichnung" fehlt.`
  if (
    wert.wettkampfId !== undefined &&
    wert.wettkampfId !== null &&
    !istText(wert.wettkampfId)
  ) {
    return `${pfad}: Feld "wettkampfId" muss Text oder null sein.`
  }
  const konfiguration = pruefeKonfiguration(wert.konfiguration, `${pfad}, Konfiguration`)
  if (konfiguration) return konfiguration
  if (wert.plan !== undefined && wert.plan !== null) {
    const plan = pruefeSatzPlan(wert.plan, `${pfad}, Plan`)
    if (plan) return plan
  }
  if (!istZahl(wert.erstelltAm)) return `${pfad}: Feld "erstelltAm" fehlt oder ist keine Zahl.`
  return null
}

/**
 * Prüft einen Anschlag: Längennummer ab 1, kumulierte Splitzeit ab 0,
 * Erfassungszeitpunkt als Zahl, Finish-Flag als Boolean. `manuell` ist
 * optional, muss aber, wenn vorhanden, ein Boolean sein.
 */
function pruefeAnschlag(wert: unknown, pfad: string): string | null {
  if (!istObjekt(wert)) return `${pfad}: Anschlag ist kein Objekt.`
  if (!istIndex(wert.laengeNr) || wert.laengeNr < 1) {
    return `${pfad}: Feld "laengeNr" muss eine ganze Zahl ab 1 sein.`
  }
  if (!istZahl(wert.splitMs) || wert.splitMs < 0) {
    return `${pfad}: Feld "splitMs" muss eine Zahl ab 0 sein.`
  }
  if (!istZahl(wert.erfasstAt)) return `${pfad}: Feld "erfasstAt" fehlt oder ist keine Zahl.`
  if (typeof wert.istFinish !== 'boolean') {
    return `${pfad}: Feld "istFinish" muss true oder false sein.`
  }
  if (wert.manuell !== undefined && typeof wert.manuell !== 'boolean') {
    return `${pfad}: Feld "manuell" muss true oder false sein.`
  }
  return null
}

/**
 * Prüft eine Bahn: Nummer im Bereich 1..`MAX_BAHNEN`, optional die Reihe im
 * Bereich 1..`MAX_REIHEN` (ältere Backups kennen sie nicht), `schwimmerId` als
 * Text oder null (ohne Zuordnung), `startMs` als Zahl oder null (nicht
 * gestartet) und eine Liste von Anschlägen, die einzeln geprüft wird.
 */
function pruefeBahn(wert: unknown, pfad: string): string | null {
  if (!istObjekt(wert)) return `${pfad}: Eintrag ist kein Objekt.`
  if (!istText(wert.id) || wert.id.length === 0) return `${pfad}: Feld "id" fehlt.`
  if (!istIndex(wert.nummer) || wert.nummer < 1 || wert.nummer > MAX_BAHNEN) {
    return `${pfad}: Feld "nummer" muss eine ganze Zahl von 1 bis ${MAX_BAHNEN} sein.`
  }
  if (
    wert.reihe !== undefined &&
    (!istIndex(wert.reihe) || wert.reihe < 1 || wert.reihe > MAX_REIHEN)
  ) {
    return `${pfad}: Feld "reihe" muss eine ganze Zahl von 1 bis ${MAX_REIHEN} sein.`
  }
  if (wert.schwimmerId !== null && !istText(wert.schwimmerId)) {
    return `${pfad}: Feld "schwimmerId" muss Text oder null sein.`
  }
  if (wert.startMs !== null && !istZahl(wert.startMs)) {
    return `${pfad}: Feld "startMs" muss eine Zahl oder null sein.`
  }
  if (
    wert.status !== undefined &&
    wert.status !== 'dns' &&
    wert.status !== 'dnf'
  ) {
    return `${pfad}: Feld "status" muss "dns", "dnf" oder leer sein.`
  }
  if (!Array.isArray(wert.anschlaege)) return `${pfad}: Feld "anschlaege" fehlt oder ist keine Liste.`
  if (wert.anschlaege.length > MAX_ANSCHLAEGE_PRO_BAHN) {
    return `${pfad}: Feld "anschlaege" darf höchstens ${MAX_ANSCHLAEGE_PRO_BAHN} Einträge enthalten.`
  }
  let vorherigeLaenge = 0
  let vorherigerSplit = -1
  for (const [i, anschlag] of wert.anschlaege.entries()) {
    const anschlagPfad = `${pfad}, Anschlag ${i + 1}`
    const fehler = pruefeAnschlag(anschlag, anschlagPfad)
    if (fehler) return fehler
    // `pruefeAnschlag` hat die Felder bereits geprüft; hier zählt die
    // Reihenfolge. Ohne sie könnten Längenzeiten negativ werden.
    const geprueft = anschlag as {
      laengeNr: number
      splitMs: number
      istFinish: boolean
    }
    if (geprueft.laengeNr !== vorherigeLaenge + 1) {
      return `${anschlagPfad}: Feld "laengeNr" muss lückenlos aufsteigen.`
    }
    if (geprueft.splitMs <= vorherigerSplit) {
      return `${anschlagPfad}: Feld "splitMs" muss größer als der vorherige Anschlag sein.`
    }
    if (geprueft.istFinish && i !== wert.anschlaege.length - 1) {
      return `${anschlagPfad}: Nur der letzte Anschlag darf das Finish sein.`
    }
    vorherigeLaenge = geprueft.laengeNr
    vorherigerSplit = geprueft.splitMs
  }
  return null
}

/**
 * Prüft einen Lauf samt Bahnen.
 *
 * `satzId` darf null sein (freier Lauf), `startWallMs` null (nie gestartet).
 * Startversatz, Wiederholung und Modus sind optional, weil ältere Backups sie
 * nicht kennen; wenn sie vorhanden sind, müssen sie in ihren Wertebereichen
 * liegen. Ein Lauf braucht mindestens eine und höchstens `MAX_BAHNEN` Bahnen.
 */
function pruefeLauf(wert: unknown, index: number): string | null {
  const pfad = `Lauf ${index + 1}`
  if (!istObjekt(wert)) return `${pfad}: Eintrag ist kein Objekt.`
  if (!istText(wert.id) || wert.id.length === 0) return `${pfad}: Feld "id" fehlt.`
  if (wert.satzId !== null && !istText(wert.satzId)) {
    return `${pfad}: Feld "satzId" muss Text oder null sein.`
  }
  const konfiguration = pruefeKonfiguration(wert.konfiguration, `${pfad}, Konfiguration`)
  if (konfiguration) return konfiguration
  if (wert.startWallMs !== null && !istZahl(wert.startWallMs)) {
    return `${pfad}: Feld "startWallMs" muss eine Zahl oder null sein.`
  }
  if (
    wert.startversatzMs !== undefined &&
    (!istZahl(wert.startversatzMs) || wert.startversatzMs < 0 || wert.startversatzMs > 120_000)
  ) {
    return `${pfad}: Feld "startversatzMs" muss zwischen 0 und 120000 liegen.`
  }
  if (
    wert.wiederholung !== undefined &&
    wert.wiederholung !== null &&
    (!istIndex(wert.wiederholung) ||
      wert.wiederholung < 1 ||
      wert.wiederholung > MAX_WIEDERHOLUNGEN)
  ) {
    return `${pfad}: Feld "wiederholung" muss eine ganze Zahl von 1 bis ${MAX_WIEDERHOLUNGEN} oder null sein.`
  }
  if (wert.modus !== undefined && wert.modus !== 'training' && wert.modus !== 'wettkampf') {
    return `${pfad}: Feld "modus" muss "training" oder "wettkampf" sein.`
  }
  if (!Array.isArray(wert.bahnen)) return `${pfad}: Feld "bahnen" fehlt oder ist keine Liste.`
  if (wert.bahnen.length === 0) return `${pfad}: Ein Lauf braucht mindestens eine Bahn.`
  const maxBahnen = bahnenGesamt(MAX_BAHNEN, MAX_REIHEN)
  if (wert.bahnen.length > maxBahnen) {
    return `${pfad}: Ein Lauf darf höchstens ${maxBahnen} Bahnen haben.`
  }
  for (const [i, bahn] of wert.bahnen.entries()) {
    const fehler = pruefeBahn(bahn, `${pfad}, Bahn ${i + 1}`)
    if (fehler) return fehler
  }
  return null
}

/**
 * Meldet die erste doppelte ID in einer Liste. Einträge ohne lesbare ID werden
 * übersprungen; dafür ist die jeweilige Einzelprüfung zuständig.
 */
function pruefeEindeutigeIds(liste: unknown[], pfad: string): string | null {
  const ids = new Set<string>()
  for (const [i, eintrag] of liste.entries()) {
    if (!istObjekt(eintrag) || !istText(eintrag.id)) continue
    if (ids.has(eintrag.id)) {
      return `${pfad} ${i + 1}: Die ID "${eintrag.id}" kommt mehrfach vor.`
    }
    ids.add(eintrag.id)
  }
  return null
}

/**
 * Prüft ein Backup vollständig, bevor irgendetwas geschrieben wird. Die Meldung
 * nennt immer das erste konkrete Problem mit Pfad, nicht nur „ungültige Datei“.
 *
 * Reihenfolge der Prüfung: Hülle (Objekt, Formatkennung, Version, Exportdatum),
 * Pflichtlisten, dann alle Datensätze. `wettkampfe` und `trainings` fehlen in
 * älteren Versionen und werden durch leere Listen ersetzt; alle anderen
 * Sammlungen sind Pflicht.
 *
 * Rückgabe: bei Erfolg `{ ok: true, backup, zusammenfassung }`, sonst
 * `{ ok: false, fehler }`. Es wird immer nur der erste Fehler gemeldet, weil
 * weitere Meldungen den Import nicht schneller machen würden.
 */
export function pruefeBackup(roh: unknown): BackupPruefung {
  if (!istObjekt(roh)) return { ok: false, fehler: 'Die Datei enthält kein JSON-Objekt.' }
  if (roh.format !== BACKUP_FORMAT) {
    return {
      ok: false,
      fehler: `Die Datei ist kein Beckenrand-Backup (Formatkennung "${BACKUP_FORMAT}" fehlt).`,
    }
  }
  // Versionen außerhalb der Liste werden abgelehnt, auch neuere: Ein älterer
  // Stand darf keine Felder ignorieren, die er nicht kennt.
  if (
    typeof roh.version !== 'number' ||
    !BACKUP_VERSIONEN.includes(roh.version as (typeof BACKUP_VERSIONEN)[number])
  ) {
    return {
      ok: false,
      fehler: `Unbekannte Backup-Version ${String(roh.version)}. Erwartet wird Version ${BACKUP_VERSION} (einlesbar sind ${BACKUP_VERSIONEN[0]} bis ${BACKUP_VERSIONEN.at(-1)}).`,
    }
  }
  if (!istText(roh.exportiertAm) || Number.isNaN(Date.parse(roh.exportiertAm))) {
    return { ok: false, fehler: 'Feld "exportiertAm" fehlt oder ist kein gültiges Datum.' }
  }
  if (!Array.isArray(roh.schwimmer)) {
    return { ok: false, fehler: 'Feld "schwimmer" fehlt oder ist keine Liste.' }
  }
  if (!Array.isArray(roh.satze)) {
    return { ok: false, fehler: 'Feld "satze" fehlt oder ist keine Liste.' }
  }
  if (!Array.isArray(roh.laeufe)) {
    return { ok: false, fehler: 'Feld "laeufe" fehlt oder ist keine Liste.' }
  }
  // Diese beiden Sammlungen kamen erst mit späteren Versionen hinzu. Fehlen sie,
  // gelten sie als leer; ein vorhandener, aber falscher Typ ist ein Fehler.
  if (roh.wettkampfe !== undefined && !Array.isArray(roh.wettkampfe)) {
    return { ok: false, fehler: 'Feld "wettkampfe" ist keine Liste.' }
  }
  if (roh.trainings !== undefined && !Array.isArray(roh.trainings)) {
    return { ok: false, fehler: 'Feld "trainings" ist keine Liste.' }
  }

  // Obergrenzen verhindern, dass eine riesige Datei den Import blockiert.
  // Die Grenzen liegen weit über dem realistischen Bestand.
  const grenzen: Array<[string, unknown[], number]> = [
    ['schwimmer', roh.schwimmer, MAX_SCHWIMMER],
    ['satze', roh.satze, MAX_SATZE],
    ['laeufe', roh.laeufe, MAX_LAEUFE],
    ['wettkampfe', Array.isArray(roh.wettkampfe) ? roh.wettkampfe : [], MAX_WETTKAMPFE],
    ['trainings', Array.isArray(roh.trainings) ? roh.trainings : [], MAX_TRAININGS],
  ]
  for (const [name, liste, max] of grenzen) {
    if (liste.length > max) {
      return {
        ok: false,
        fehler: `Feld "${name}" darf höchstens ${max} Einträge enthalten.`,
      }
    }
  }

  // Doppelte IDs würde der Upsert-Import stillschweigend zu einem Datensatz
  // zusammenfassen; das ist ein Datenverlust und deshalb ein Fehler.
  const doppelte = pruefeEindeutigeIds(roh.schwimmer, 'Schwimmer')
    ?? pruefeEindeutigeIds(roh.satze, 'Satz')
    ?? pruefeEindeutigeIds(roh.laeufe, 'Lauf')
    ?? pruefeEindeutigeIds(Array.isArray(roh.wettkampfe) ? roh.wettkampfe : [], 'Wettkampf')
    ?? pruefeEindeutigeIds(Array.isArray(roh.trainings) ? roh.trainings : [], 'Training')
  if (doppelte) return { ok: false, fehler: doppelte }

  // Jeder Datensatz wird einzeln geprüft; der erste Fehler beendet die Prüfung.
  // Die Meldungen tragen den Pfad (z. B. "Lauf 1, Bahn 2, Anschlag 1").
  for (const [i, schwimmer] of roh.schwimmer.entries()) {
    const fehler = pruefeSchwimmer(schwimmer, i)
    if (fehler) return { ok: false, fehler }
  }
  for (const [i, satz] of roh.satze.entries()) {
    const fehler = pruefeSatz(satz, i)
    if (fehler) return { ok: false, fehler }
  }
  for (const [i, lauf] of roh.laeufe.entries()) {
    const fehler = pruefeLauf(lauf, i)
    if (fehler) return { ok: false, fehler }
  }

  const wettkampfe = Array.isArray(roh.wettkampfe) ? roh.wettkampfe : []
  for (const [i, wettkampf] of wettkampfe.entries()) {
    const fehler = pruefeWettkampf(wettkampf, i)
    if (fehler) return { ok: false, fehler }
  }

  const trainings = Array.isArray(roh.trainings) ? roh.trainings : []
  for (const [i, training] of trainings.entries()) {
    const fehler = pruefeTraining(training, i)
    if (fehler) return { ok: false, fehler }
  }

  // Nach den Prüfungen sind alle gelesenen Felder typkorrekt; die fehlenden
  // Sammlungen sind ergänzt. Der Cast dokumentiert nur, was bereits geprüft ist.
  const backup = { ...roh, wettkampfe, trainings } as unknown as Backup
  return {
    ok: true,
    backup,
    zusammenfassung: {
      schwimmer: backup.schwimmer.length,
      satze: backup.satze.length,
      laeufe: backup.laeufe.length,
      wettkampfe: backup.wettkampfe.length,
      trainings: backup.trainings.length,
    },
  }
}

/**
 * Formatiert die Zählung für die Import-Vorschau, z. B.
 * „2 Schwimmer, 1 Wettkampf, 0 Trainings, 3 Sätze, 5 Läufe“.
 *
 * Reihenfolge und deutsche Singular-/Pluralformen sind fest, damit die
 * Vorschau unabhängig vom Bestand gleich aussieht. „Schwimmer“ bleibt im
 * Plural unverändert.
 */
export function zusammenfassungText(zahlen: BackupZusammenfassung): string {
  const teil = (anzahl: number, singular: string, plural: string) =>
    `${anzahl} ${anzahl === 1 ? singular : plural}`
  return [
    teil(zahlen.schwimmer, 'Schwimmer', 'Schwimmer'),
    teil(zahlen.wettkampfe, 'Wettkampf', 'Wettkämpfe'),
    teil(zahlen.trainings, 'Training', 'Trainings'),
    teil(zahlen.satze, 'Satz', 'Sätze'),
    teil(zahlen.laeufe, 'Lauf', 'Läufe'),
  ].join(', ')
}

/**
 * Kanonische Textform eines Werts: Schlüssel sortiert, `undefined` wie ein
 * fehlendes Feld. Zwei Datensätze sind damit gleich, wenn sie fachlich
 * denselben Inhalt haben — unabhängig von der Reihenfolge im JSON.
 */
function kanonisch(wert: unknown): string {
  if (Array.isArray(wert)) return `[${wert.map(kanonisch).join(',')}]`
  if (istObjekt(wert)) {
    const felder = Object.entries(wert)
      .filter(([, eintrag]) => eintrag !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([schluessel, eintrag]) => `${JSON.stringify(schluessel)}:${kanonisch(eintrag)}`)
    return `{${felder.join(',')}}`
  }
  return JSON.stringify(wert) ?? 'null'
}

/** Wahr, wenn beide Werte fachlich denselben Inhalt haben. */
function istGleich(a: unknown, b: unknown): boolean {
  return kanonisch(a) === kanonisch(b)
}

/** Summe aller Anschläge eines Laufs über alle Bahnen. */
function anschlaegeGesamt(lauf: Lauf): number {
  return lauf.bahnen.reduce((summe, bahn) => summe + bahn.anschlaege.length, 0)
}

/** Spätester Erfassungszeitpunkt eines Laufs; 0, wenn noch nichts erfasst ist. */
function letzteErfassung(lauf: Lauf): number {
  let spaeteste = 0
  for (const bahn of lauf.bahnen) {
    for (const anschlag of bahn.anschlaege) {
      if (anschlag.erfasstAt > spaeteste) spaeteste = anschlag.erfasstAt
    }
  }
  return spaeteste
}

/**
 * Bewertet einen Lauf-Konflikt. Maßgeblich sind die Messdaten, nicht die
 * Reihenfolge im Backup: mehr Anschläge, ein späterer Start oder eine später
 * erfasste Zeit sprechen für den lokalen Stand.
 */
function laufKonfliktArt(lokal: Lauf, ausBackup: Lauf): KonfliktArt | null {
  if (istGleich(lokal, ausBackup)) return null
  const lokalNeuer =
    anschlaegeGesamt(lokal) > anschlaegeGesamt(ausBackup) ||
    (lokal.startWallMs ?? 0) > (ausBackup.startWallMs ?? 0) ||
    letzteErfassung(lokal) > letzteErfassung(ausBackup)
  return lokalNeuer ? 'lokalNeuer' : 'abweichend'
}

/** Bewertet einen Datensatz mit `erstelltAm`; ein späteres Datum gilt als neuer. */
function erstelltAmKonfliktArt<T extends { erstelltAm: number }>(
  lokal: T,
  ausBackup: T,
): KonfliktArt | null {
  if (istGleich(lokal, ausBackup)) return null
  return lokal.erstelltAm > ausBackup.erstelltAm ? 'lokalNeuer' : 'abweichend'
}

/**
 * Vergleicht ein geprüftes Backup mit dem lokalen Bestand und liefert alle
 * Kollisionen. Datensätze ohne lokales Gegenstück sind keine Konflikte, ebenso
 * fachlich gleiche Datensätze.
 *
 * Beide Seiten müssen normalisiert sein (siehe `normalisiereBackup` im
 * Repository), sonst würde ein älteres Backup allein wegen fehlender
 * Zusatzfelder als abweichend gelten.
 */
export function ermittleBackupKonflikte(
  backup: BackupBestand,
  bestand: BackupBestand,
): BackupKonflikte {
  const eintraege: BackupKonflikt[] = []

  const vergleiche = <T extends { id: string }>(
    name: keyof BackupBestand,
    ausBackup: T[],
    lokal: T[],
    art: (lokal: T, ausBackup: T) => KonfliktArt | null,
  ) => {
    const nachId = new Map(lokal.map((eintrag) => [eintrag.id, eintrag]))
    for (const eintrag of ausBackup) {
      const vorhanden = nachId.get(eintrag.id)
      if (!vorhanden) continue
      const ergebnis = art(vorhanden, eintrag)
      if (ergebnis) eintraege.push({ bestand: name, id: eintrag.id, art: ergebnis })
    }
  }

  // Läufe zuerst, weil sie die Messdaten tragen und in der Anzeige zählen.
  vergleiche('laeufe', backup.laeufe, bestand.laeufe, laufKonfliktArt)
  vergleiche('schwimmer', backup.schwimmer, bestand.schwimmer, erstelltAmKonfliktArt)
  vergleiche('wettkampfe', backup.wettkampfe, bestand.wettkampfe, erstelltAmKonfliktArt)
  vergleiche('trainings', backup.trainings, bestand.trainings, erstelltAmKonfliktArt)
  vergleiche('satze', backup.satze, bestand.satze, erstelltAmKonfliktArt)

  return {
    eintraege,
    gesamt: eintraege.length,
    neuereLokale: eintraege.filter((eintrag) => eintrag.art === 'lokalNeuer').length,
  }
}

/**
 * Wendet die Entscheidung auf das Backup an.
 *
 * `lokalBehalten` entfernt alle kollidierenden Datensätze aus dem Import; sie
 * bleiben im lokalen Bestand unverändert. `backupErsetzen` gibt das Backup
 * unverändert zurück. Die übrigen Datensätze werden in beiden Fällen
 * übernommen.
 */
export function loeseBackupKonflikte(
  backup: BackupBestand,
  konflikte: BackupKonflikt[],
  aufloesung: KonfliktAufloesung,
): BackupBestand {
  if (aufloesung === 'backupErsetzen' || konflikte.length === 0) return backup
  const betroffen: Record<keyof BackupBestand, Set<string>> = {
    schwimmer: new Set(),
    satze: new Set(),
    laeufe: new Set(),
    wettkampfe: new Set(),
    trainings: new Set(),
  }
  for (const konflikt of konflikte) betroffen[konflikt.bestand].add(konflikt.id)
  return {
    ...backup,
    schwimmer: backup.schwimmer.filter((eintrag) => !betroffen.schwimmer.has(eintrag.id)),
    satze: backup.satze.filter((eintrag) => !betroffen.satze.has(eintrag.id)),
    laeufe: backup.laeufe.filter((eintrag) => !betroffen.laeufe.has(eintrag.id)),
    wettkampfe: backup.wettkampfe.filter((eintrag) => !betroffen.wettkampfe.has(eintrag.id)),
    trainings: backup.trainings.filter((eintrag) => !betroffen.trainings.has(eintrag.id)),
  }
}

/** Anzeigenamen je Bestand, Reihenfolge wie in `zusammenfassungText`. */
const KONFLIKT_LABELS: Record<keyof BackupBestand, [string, string]> = {
  schwimmer: ['Schwimmer', 'Schwimmer'],
  wettkampfe: ['Wettkampf', 'Wettkämpfe'],
  trainings: ['Training', 'Trainings'],
  satze: ['Satz', 'Sätze'],
  laeufe: ['Lauf', 'Läufe'],
}

const KONFLIKT_REIHENFOLGE: Array<keyof BackupBestand> = [
  'schwimmer',
  'wettkampfe',
  'trainings',
  'satze',
  'laeufe',
]

/**
 * Formatiert die Konfliktprüfung für die Import-Vorschau, z. B.
 * „3 Konflikte: 2 Läufe, 1 Schwimmer. 2 davon sind lokal neuer.“
 * Ohne Konflikte ist der Text leer, damit die Vorschau unverändert bleibt.
 */
export function konfliktText(konflikte: BackupKonflikte): string {
  if (konflikte.gesamt === 0) return ''
  const zaehler = new Map<keyof BackupBestand, number>()
  for (const eintrag of konflikte.eintraege) {
    zaehler.set(eintrag.bestand, (zaehler.get(eintrag.bestand) ?? 0) + 1)
  }
  const teile = KONFLIKT_REIHENFOLGE.filter((name) => (zaehler.get(name) ?? 0) > 0).map((name) => {
    const anzahl = zaehler.get(name) ?? 0
    const [singular, plural] = KONFLIKT_LABELS[name]
    return `${anzahl} ${anzahl === 1 ? singular : plural}`
  })
  const kopf = `${konflikte.gesamt} ${konflikte.gesamt === 1 ? 'Konflikt' : 'Konflikte'}: ${teile.join(', ')}.`
  if (konflikte.neuereLokale === 0) return kopf
  return `${kopf} ${konflikte.neuereLokale} davon ${konflikte.neuereLokale === 1 ? 'ist' : 'sind'} lokal neuer.`
}
