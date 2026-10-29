/**
 * Zugriff auf `localStorage`, der nie wirft.
 *
 * Safari im privaten Modus und blockierte Cookies lassen `localStorage` schon
 * beim Lesen scheitern. Die App muss dann weiterlaufen — nur ohne gemerkte
 * Auswahl, nicht mit einer weißen Seite. Persistente Daten (Läufe, Sätze, …)
 * gehen dagegen über IndexedDB und melden Fehler über das Banner.
 */
export function leseText(schluessel: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(schluessel)
  } catch {
    return null
  }
}

/** Schreibt einen Wert und schluckt Fehler; ein voller Speicher darf nicht unterbrechen. */
export function schreibeText(schluessel: string, wert: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(schluessel, wert)
  } catch {
    // ohne Speicher bleibt die Sitzung bedienbar
  }
}

export function entferneText(schluessel: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(schluessel)
  } catch {
    // siehe oben
  }
}
