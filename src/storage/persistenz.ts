/**
 * Die Läufe liegen nur in IndexedDB. Ohne „persistenten“ Speicher darf der
 * Browser sie bei Platzmangel verwerfen — für Trainer ist das der einzige
 * Datensatz. Deshalb fragen wir den Schutz aktiv an.
 */
export type SpeicherSchutz = 'geschuetzt' | 'ungeschuetzt' | 'unbekannt'

function hatStorageManager(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.persisted === 'function'
}

export async function leseSpeicherSchutz(): Promise<SpeicherSchutz> {
  if (!hatStorageManager()) return 'unbekannt'
  try {
    return (await navigator.storage.persisted()) ? 'geschuetzt' : 'ungeschuetzt'
  } catch {
    return 'unbekannt'
  }
}

/** Fordert dauerhaften Speicher an. Gibt den resultierenden Schutz zurück. */
export async function schuetzeSpeicher(): Promise<SpeicherSchutz> {
  if (!hatStorageManager() || typeof navigator.storage.persist !== 'function') return 'unbekannt'
  try {
    await navigator.storage.persist()
    return await leseSpeicherSchutz()
  } catch {
    return 'unbekannt'
  }
}

/**
 * Beim Start einmalig versuchen. Browser entscheiden je nach Nutzung selbst,
 * ob sie den Schutz gewähren — ein stiller Fehlschlag ist unkritisch.
 */
export async function schuetzeSpeicherBeimStart(): Promise<SpeicherSchutz> {
  const aktuell = await leseSpeicherSchutz()
  if (aktuell !== 'ungeschuetzt') return aktuell
  return schuetzeSpeicher()
}
