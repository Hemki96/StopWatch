/**
 * Datenzugriff für die Oberfläche: Backup und dauerhafter Speicher.
 *
 * `ui/` liest nicht direkt aus `storage/` (siehe
 * [Architektur](../../docs/entwicklung/architektur.md)). Dieses Modul ist die
 * schmale Fassade dazwischen: Es bündelt die lesenden und prüfenden
 * Storage-Funktionen, die die Einstellungen brauchen, und exportiert die Typen,
 * damit Screens ohne Storage-Import auskommen.
 *
 * Schreibvorgänge bleiben im Provider (`importiereBackup`, `loescheAlles`):
 * Dort sind Tab-Rolle und Warteschlange offener Schreibvorgänge zu Hause. Hier
 * wird nichts geschrieben und kein React benötigt.
 */
import { pruefeBackup, zusammenfassungText, type Backup } from '../storage/backup'
import { exportBackup } from '../storage/repository'
import {
  leseSpeicherSchutz,
  schuetzeSpeicher,
  type SpeicherSchutz,
} from '../storage/persistenz'

export type { Backup, SpeicherSchutz }

/**
 * Ergebnis der Import-Prüfung, fertig für die Vorschau.
 *
 * Bei Erfolg stehen das typisierte Backup und der Zähltext bereit; bei einem
 * Fehler nur die deutsche Meldung mit Pfad zum ersten Problem. Aufrufer müssen
 * `ok` prüfen, bevor sie `backup` verwenden.
 */
export type BackupVorschau =
  | { ok: true; backup: Backup; text: string }
  | { ok: false; fehler: string }

/**
 * Prüft einen bereits geparsten Dateiinhalt, ohne etwas zu schreiben.
 *
 * Die Prüfung selbst liegt in `storage/backup.ts`; hier wird nur die
 * Zusammenfassung für die Vorschau ergänzt, damit die Oberfläche die
 * Storage-Typen nicht kennen muss.
 */
export function pruefeBackupFuerImport(inhalt: unknown): BackupVorschau {
  const pruefung = pruefeBackup(inhalt)
  if (!pruefung.ok) return { ok: false, fehler: pruefung.fehler }
  return {
    ok: true,
    backup: pruefung.backup,
    text: zusammenfassungText(pruefung.zusammenfassung),
  }
}

/** Liest den kompletten Bestand als Backup-Objekt; geschrieben wird über `export/`. */
export function erzeugeBackup(): Promise<Backup> {
  return exportBackup()
}

/** Liest den Schutzstatus, ohne ihn anzufordern. */
export function leseSchutz(): Promise<SpeicherSchutz> {
  return leseSpeicherSchutz()
}

/** Fordert dauerhaften Speicher an und liefert den resultierenden Status. */
export function fordereSchutzAn(): Promise<SpeicherSchutz> {
  return schuetzeSpeicher()
}
