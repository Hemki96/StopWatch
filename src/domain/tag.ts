/**
 * Tagesbezeichnungen im Verlauf.
 *
 * Ein Trainingstag ist kein eigenes gespeichertes Objekt, sondern die Menge der
 * Sätze mit demselben `datum`. Der Name des Tages liegt deshalb als optionales
 * Feld `tagesbezeichnung` an jedem dieser Sätze. Diese Datei hält die beiden
 * Regeln dafür an einer Stelle: Beim Lesen gilt der erste nicht-leere Name des
 * Datums, beim Schreiben erhalten alle Sätze des Datums denselben Namen.
 *
 * Die Funktionen sind rein und verändern die Eingabe nicht.
 */
import type { Satz } from './types'

/**
 * Die Namen aller Tage als Zuordnung `datum → bezeichnung`.
 *
 * Maßgeblich ist der erste nicht-leere Name in der übergebenen Reihenfolge.
 * Sätze ohne Datum oder ohne Namen erzeugen keinen Eintrag. Ein Tag ohne
 * Eintrag hat keinen Namen.
 */
export function tagesnamen(satze: readonly Satz[]): Map<string, string> {
  const namen = new Map<string, string>()
  for (const satz of satze) {
    if (!satz.datum || namen.has(satz.datum)) continue
    const name = satz.tagesbezeichnung?.trim()
    if (name) namen.set(satz.datum, name)
  }
  return namen
}

/**
 * Setzt den Namen eines Tages auf allen Sätzen dieses Datums.
 *
 * Leere oder nur aus Leerzeichen bestehende Namen entfernen die Bezeichnung.
 * Ändert sich nichts, kommt dieselbe Liste zurück; der Aufrufer kann das als
 * „kein Schreibvorgang nötig“ verwenden. Sätze anderer Tage bleiben unberührt.
 */
export function setzeTagesnamen(satze: Satz[], datum: string, bezeichnung: string): Satz[] {
  const name = bezeichnung.trim()
  let geaendert = false
  const naechste = satze.map((satz) => {
    if (satz.datum !== datum) return satz
    if ((satz.tagesbezeichnung ?? '') === name) return satz
    geaendert = true
    return { ...satz, tagesbezeichnung: name }
  })
  return geaendert ? naechste : satze
}
