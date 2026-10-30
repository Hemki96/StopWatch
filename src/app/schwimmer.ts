/**
 * Schwimmer-Stammdaten: die Liste stabil sortieren.
 *
 * Verglichen wird ohne Rücksicht auf Groß-/Kleinschreibung und umgebende
 * Leerzeichen (deutsche Locale).
 */
import type { Schwimmer } from '../domain/types'

/** Sortiert nach Namen, wie ihn die Auswahl in den Dialogen erwartet. */
export function sortiereSchwimmer(liste: Schwimmer[]): Schwimmer[] {
  return [...liste].sort((a, b) => a.name.localeCompare(b.name, 'de'))
}
