/**
 * Prüfung und Format des JSON-Backups.
 *
 * Ein Backup ist ein einzelnes JSON-Objekt mit Formatkennung, Version,
 * Exportzeitpunkt und den fünf Beständen. `pruefeBackup` validiert es
 * vollständig, bevor `repository.importBackup` irgendetwas schreibt; die
 * Rückgabe enthält entweder das typisierte Backup samt Zählung oder eine
 * Fehlermeldung mit Pfad zum ersten konkreten Problem.
 *
 * Datenfluss: `SettingsScreen` liest die Datei, parst das JSON und ruft
 * `pruefeBackup` für die Vorschau auf; erst nach Bestätigung geht dasselbe
 * Objekt an `importBackup`, das erneut prüft.
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
import {
  SCHWIMMARTEN,
  type Lauf,
  type Satz,
  type Schwimmer,
  type Training,
  type Wettkampf,
} from '../domain/types'

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
  if (wert.beckenlaengeM !== 25 && wert.beckenlaengeM !== 50) {
    return `${pfad}: Feld "beckenlaengeM" muss 25 oder 50 sein.`
  }
  if (wert.streckeM !== null && (!istZahl(wert.streckeM) || wert.streckeM <= 0)) {
    return `${pfad}: Feld "streckeM" muss eine positive Zahl oder null sein.`
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
  if (wert.jahrgang !== null && !istZahl(wert.jahrgang)) {
    return `${pfad}: Feld "jahrgang" muss eine Zahl oder null sein.`
  }
  if (!istText(wert.notiz)) return `${pfad}: Feld "notiz" fehlt.`
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
  if (wert.beckenlaengeM !== 25 && wert.beckenlaengeM !== 50) {
    return `${pfad}: Feld "beckenlaengeM" muss 25 oder 50 sein.`
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
  if (!Array.isArray(wert.anschlaege)) return `${pfad}: Feld "anschlaege" fehlt oder ist keine Liste.`
  for (const [i, anschlag] of wert.anschlaege.entries()) {
    const fehler = pruefeAnschlag(anschlag, `${pfad}, Anschlag ${i + 1}`)
    if (fehler) return fehler
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
    (!istIndex(wert.wiederholung) || wert.wiederholung < 1)
  ) {
    return `${pfad}: Feld "wiederholung" muss eine ganze Zahl ab 1 oder null sein.`
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
