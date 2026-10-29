/**
 * Schwimmer-Stammdaten: Namen auflösen und die Liste stabil sortieren.
 *
 * Meldelisten und Importe enthalten Namen, keine IDs. Beim Anlegen wird ein
 * vorhandener Datensatz wiederverwendet, damit dieselbe Person nicht mit zwei
 * Bestzeiten erscheint. Verglichen wird ohne Rücksicht auf Groß-/Kleinschreibung
 * und umgebende Leerzeichen (deutsche Locale).
 */
import type { Schwimmer } from '../domain/types'
import { newId } from '../domain/id'

/** Sortiert nach Namen, wie ihn die Auswahl in den Dialogen erwartet. */
export function sortiereSchwimmer(liste: Schwimmer[]): Schwimmer[] {
  return [...liste].sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

/**
 * Löst einen Namen aus einer Meldeliste auf. Vorhandene Schwimmer werden
 * wiederverwendet, neue nur einmal pro Import angelegt. Leere Namen bleiben
 * ohne Zuordnung — so entstehen manuell angelegte, noch namenlose Bahnen.
 *
 * `neue` ist der Puffer des laufenden Imports: Er verhindert Dubletten
 * innerhalb eines Aufrufs, bevor der State aktualisiert ist, und wird vom
 * Aufrufer gespeichert.
 */
export function schwimmerIdFuer(
  name: string,
  jahrgang: number | null,
  vorhandene: Schwimmer[],
  neue: Schwimmer[],
): string | null {
  const bereinigt = name.trim()
  if (!bereinigt) return null
  const normal = bereinigt.toLocaleLowerCase('de')
  const treffer = [...vorhandene, ...neue].find(
    (eintrag) => eintrag.name.toLocaleLowerCase('de') === normal,
  )
  if (treffer) return treffer.id
  const eintrag: Schwimmer = {
    id: newId(),
    name: bereinigt,
    jahrgang,
    notiz: '',
    erstelltAm: Date.now(),
  }
  neue.push(eintrag)
  return eintrag.id
}
