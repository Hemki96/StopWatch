/**
 * Dauerhafter Speicher (StorageManager).
 *
 * Die Läufe liegen nur in IndexedDB. Ohne „persistenten“ Speicher darf der
 * Browser sie bei Platzmangel verwerfen — für Trainer ist das der einzige
 * Datensatz. Deshalb fragen wir den Schutz aktiv an und melden den Zustand,
 * damit die Einstellungen ihn anzeigen können.
 *
 * Datenfluss: `main.tsx` ruft beim Start einmal `schuetzeSpeicherBeimStart` auf;
 * die Oberfläche liest den Zustand über `app/daten.ts` (`AppProvider`) und
 * fordert bei Bedarf mit `schuetzeSpeicher` erneut an. Alle Funktionen sind
 * fehlertolerant: Fehlt die API oder wirft sie, gilt der Zustand als
 * `unbekannt` und die App läuft weiter.
 *
 * Wichtig: Ein erteilter Schutz ist eine Zusage des Browsers, keine Garantie.
 * Er verhindert das Verwerfen durch Speicherdruck, ersetzt aber kein Backup.
 */

/**
 * Ergebnis der Schutzabfrage.
 *
 * `geschuetzt` heißt, der Browser hat dauerhaften Speicher zugesagt;
 * `ungeschuetzt` heißt, er darf die Daten verwerfen; `unbekannt` heißt, die
 * API fehlt oder die Abfrage ist fehlgeschlagen — dann wird nichts angenommen.
 */
export type SpeicherSchutz = 'geschuetzt' | 'ungeschuetzt' | 'unbekannt'

/**
 * Prüft, ob `navigator.storage.persisted` verfügbar ist. In Umgebungen ohne
 * `navigator` (z. B. Tests oder Server-Rendering) ist das nicht der Fall.
 */
function hatStorageManager(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.persisted === 'function'
}

/**
 * Liest den aktuellen Schutzstatus, ohne ihn anzufordern.
 *
 * Rückgabe: `geschuetzt`, `ungeschuetzt` oder `unbekannt`, wenn die API fehlt
 * oder der Aufruf wirft. Es wird nie eine Ausnahme nach außen gegeben.
 */
export async function leseSpeicherSchutz(): Promise<SpeicherSchutz> {
  if (!hatStorageManager()) return 'unbekannt'
  try {
    return (await navigator.storage.persisted()) ? 'geschuetzt' : 'ungeschuetzt'
  } catch {
    return 'unbekannt'
  }
}

/**
 * Fordert dauerhaften Speicher an. Gibt den resultierenden Schutz zurück.
 *
 * Der Rückgabewert von `persist()` wird bewusst nicht ausgewertet; maßgeblich
 * ist der tatsächliche Zustand aus `persisted()`, den der Browser auch
 * unabhängig von der Anfrage setzen kann. Fehlt die Funktion oder wirft der
 * Aufruf, bleibt der Zustand `unbekannt`.
 */
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
 *
 * Nur bei `ungeschuetzt` wird `persist()` aufgerufen. Ein bereits geschützter
 * oder unbekannter Zustand bleibt unangetastet; so entsteht bei jedem Start
 * höchstens eine Anfrage.
 */
export async function schuetzeSpeicherBeimStart(): Promise<SpeicherSchutz> {
  const aktuell = await leseSpeicherSchutz()
  if (aktuell !== 'ungeschuetzt') return aktuell
  return schuetzeSpeicher()
}
