/**
 * Zugriff auf `localStorage`, der nie wirft.
 *
 * Safari im privaten Modus und blockierte Cookies lassen `localStorage` schon
 * beim Lesen scheitern. Die App muss dann weiterlaufen — nur ohne gemerkte
 * Auswahl, nicht mit einer weißen Seite. Persistente Daten (Läufe, Sätze, …)
 * gehen dagegen über IndexedDB und melden Fehler über das Banner.
 *
 * Schlüssel sind logisch (`theme`, `einstellungen`, …). Der physische Schlüssel
 * trägt den Speicher-Namensraum aus `storage/namensraum.ts`, damit sich die App
 * auf einer geteilten Origin nicht mit anderen Projekten überschneidet. Beim
 * Lesen wird zusätzlich der frühere Schlüssel ohne Namensraum geprüft: So
 * behalten bestehende Installationen ihre Auswahl, ohne dass etwas kopiert
 * oder gelöscht werden muss. Geschrieben wird immer der neue Schlüssel.
 */
import { legacySchluessel, speicherSchluessel } from '../storage/namensraum'

/**
 * Liest einen logischen Schlüssel; der alte Schlüssel dient als Rückfall.
 *
 * `rueckfall` gilt nur bei einem Speicherfehler (privater Modus, blockierte
 * Cookies), nicht bei einem schlicht fehlenden Wert. So kann etwa das
 * Onboarding bei kaputtem Speicher als erledigt gelten, ohne einen neuen
 * Besuch fälschlich zu überspringen.
 */
export function leseTextMitRueckfall(schluessel: string, rueckfall: string | null): string | null {
  try {
    if (typeof localStorage === 'undefined') return rueckfall
    return (
      localStorage.getItem(speicherSchluessel(schluessel)) ??
      localStorage.getItem(legacySchluessel(schluessel))
    )
  } catch {
    return rueckfall
  }
}

/** Liest einen logischen Schlüssel; der alte Schlüssel dient als Rückfall. */
export function leseText(schluessel: string): string | null {
  return leseTextMitRueckfall(schluessel, null)
}

/** Schreibt einen Wert und schluckt Fehler; ein voller Speicher darf nicht unterbrechen. */
export function schreibeText(schluessel: string, wert: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(speicherSchluessel(schluessel), wert)
  } catch {
    // ohne Speicher bleibt die Sitzung bedienbar
  }
}

/**
 * Entfernt beide Schreibstellen. Bliebe der alte Schlüssel stehen, würde er
 * nach dem Löschen wieder als Rückfall gelesen.
 */
export function entferneText(schluessel: string): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(speicherSchluessel(schluessel))
    localStorage.removeItem(legacySchluessel(schluessel))
  } catch {
    // siehe oben
  }
}
