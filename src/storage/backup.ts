import { SCHWIMMARTEN, type Lauf, type Satz, type Schwimmer } from '../domain/types'

export const BACKUP_FORMAT = 'beckenrand-backup'
export const BACKUP_VERSION = 1

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportiertAm: string
  schwimmer: Schwimmer[]
  satze: Satz[]
  laeufe: Lauf[]
}

export interface BackupZusammenfassung {
  schwimmer: number
  satze: number
  laeufe: number
}

export type BackupPruefung =
  | { ok: true; backup: Backup; zusammenfassung: BackupZusammenfassung }
  | { ok: false; fehler: string }

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert)
}

function istText(wert: unknown): wert is string {
  return typeof wert === 'string'
}

function istZahl(wert: unknown): wert is number {
  return typeof wert === 'number' && Number.isFinite(wert)
}

function istIndex(wert: unknown): wert is number {
  return Number.isInteger(wert) && (wert as number) >= 0
}

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

function pruefeSatzPlan(wert: unknown, pfad: string): string | null {
  if (!istObjekt(wert)) return `${pfad}: Der Plan ist kein Objekt.`
  if (!istIndex(wert.wiederholungen) || wert.wiederholungen < 2) {
    return `${pfad}: Feld "wiederholungen" muss eine ganze Zahl ab 2 sein.`
  }
  if (!istZahl(wert.taktSek) || wert.taktSek <= 0) {
    return `${pfad}: Feld "taktSek" muss eine positive Zahl sein.`
  }
  if (!istZahl(wert.startversatzMs) || wert.startversatzMs < 0) {
    return `${pfad}: Feld "startversatzMs" muss eine Zahl ab 0 sein.`
  }
  return null
}

function pruefeSatz(wert: unknown, index: number): string | null {
  const pfad = `Satz ${index + 1}`
  if (!istObjekt(wert)) return `${pfad}: Eintrag ist kein Objekt.`
  if (!istText(wert.id) || wert.id.length === 0) return `${pfad}: Feld "id" fehlt.`
  if (!istText(wert.datum) || !/^\d{4}-\d{2}-\d{2}$/.test(wert.datum)) {
    return `${pfad}: Feld "datum" muss ein Datum im Format JJJJ-MM-TT sein.`
  }
  if (!istText(wert.bezeichnung)) return `${pfad}: Feld "bezeichnung" fehlt.`
  const konfiguration = pruefeKonfiguration(wert.konfiguration, `${pfad}, Konfiguration`)
  if (konfiguration) return konfiguration
  if (wert.plan !== undefined && wert.plan !== null) {
    const plan = pruefeSatzPlan(wert.plan, `${pfad}, Plan`)
    if (plan) return plan
  }
  if (!istZahl(wert.erstelltAm)) return `${pfad}: Feld "erstelltAm" fehlt oder ist keine Zahl.`
  return null
}

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

function pruefeBahn(wert: unknown, pfad: string): string | null {
  if (!istObjekt(wert)) return `${pfad}: Eintrag ist kein Objekt.`
  if (!istText(wert.id) || wert.id.length === 0) return `${pfad}: Feld "id" fehlt.`
  if (!istIndex(wert.nummer) || wert.nummer < 1) {
    return `${pfad}: Feld "nummer" muss eine ganze Zahl ab 1 sein.`
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
    (!istZahl(wert.startversatzMs) || wert.startversatzMs < 0)
  ) {
    return `${pfad}: Feld "startversatzMs" muss eine Zahl ab 0 sein.`
  }
  if (
    wert.wiederholung !== undefined &&
    wert.wiederholung !== null &&
    (!istIndex(wert.wiederholung) || wert.wiederholung < 1)
  ) {
    return `${pfad}: Feld "wiederholung" muss eine ganze Zahl ab 1 oder null sein.`
  }
  if (!Array.isArray(wert.bahnen)) return `${pfad}: Feld "bahnen" fehlt oder ist keine Liste.`
  if (wert.bahnen.length === 0) return `${pfad}: Ein Lauf braucht mindestens eine Bahn.`
  for (const [i, bahn] of wert.bahnen.entries()) {
    const fehler = pruefeBahn(bahn, `${pfad}, Bahn ${i + 1}`)
    if (fehler) return fehler
  }
  return null
}

/**
 * Prüft ein Backup vollständig, bevor irgendetwas geschrieben wird. Die Meldung
 * nennt immer das erste konkrete Problem mit Pfad, nicht nur „ungültige Datei“.
 */
export function pruefeBackup(roh: unknown): BackupPruefung {
  if (!istObjekt(roh)) return { ok: false, fehler: 'Die Datei enthält kein JSON-Objekt.' }
  if (roh.format !== BACKUP_FORMAT) {
    return {
      ok: false,
      fehler: `Die Datei ist kein Beckenrand-Backup (Formatkennung "${BACKUP_FORMAT}" fehlt).`,
    }
  }
  if (roh.version !== BACKUP_VERSION) {
    return {
      ok: false,
      fehler: `Unbekannte Backup-Version ${String(roh.version)}. Erwartet wird Version ${BACKUP_VERSION}.`,
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

  const backup = roh as unknown as Backup
  return {
    ok: true,
    backup,
    zusammenfassung: {
      schwimmer: backup.schwimmer.length,
      satze: backup.satze.length,
      laeufe: backup.laeufe.length,
    },
  }
}

export function zusammenfassungText(zahlen: BackupZusammenfassung): string {
  const teil = (anzahl: number, singular: string, plural: string) =>
    `${anzahl} ${anzahl === 1 ? singular : plural}`
  return [
    teil(zahlen.schwimmer, 'Schwimmer', 'Schwimmer'),
    teil(zahlen.satze, 'Satz', 'Sätze'),
    teil(zahlen.laeufe, 'Lauf', 'Läufe'),
  ].join(', ')
}
