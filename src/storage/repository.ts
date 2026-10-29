/**
 * Repository: der einzige fachliche Zugriff auf IndexedDB.
 *
 * Kapselt Lesen (inklusive Normalisierung älterer Datensätze), Schreiben,
 * kaskadiertes Löschen sowie Export und Import von Backups. Aufrufer arbeiten
 * ausschließlich mit Domänenobjekten aus `domain/types`; IndexedDB-Transaktionen
 * und Schlüssel bleiben hier.
 *
 * Zentrale Invarianten:
 * - Beim Laden werden fehlende Felder älterer Stände defensiv ergänzt
 *   (`normalize…OnLoad`), damit ein Backup aus einer früheren Version nutzbar
 *   bleibt.
 * - Laufende Bahnen ohne Ziel werden beim Laden auf „nicht gestartet“
 *   zurückgesetzt, weil `performance.now()` einen Reload nicht überlebt.
 * - Kaskadierende Löschungen erfassen abhängige Datensätze in derselben
 *   Transaktion, damit keine verwaisten Läufe oder Sätze zurückbleiben.
 * - Schreiben ist ein Upsert über die jeweilige `id`.
 */
import { getDb } from './db'
import type { Lauf, Satz, Schwimmer, Training, Wettkampf } from '../domain/types'
import { MAX_BAHNEN, MAX_REIHEN, bahnenGesamt } from '../domain/training'
import { bahnReihe, isFinished } from '../domain/lauf'
import { BACKUP_FORMAT, BACKUP_VERSION, pruefeBackup, type Backup } from './backup'

/**
 * Bringt einen geladenen Lauf auf den aktuellen Stand und entschärft
 * Zeitstempel, die nach einem Neustart nicht mehr gültig sind.
 *
 * Ein Lauf überlebt einen App-Neustart nur als Historie: `performance.now()` ist
 * nach dem Reload wertlos. Laufende und geplante Bahnen werden deshalb auf
 * "nicht gestartet" zurückgesetzt, damit keine unsinnigen Zeiten entstehen.
 * Ältere Datensätze kennen Startversatz und Wiederholung noch nicht.
 *
 * - `startversatzMs` wird auf eine nicht negative ganze Zahl begrenzt; ältere
 *   Datensätze kennen das Feld nicht und erhalten 0.
 * - `wiederholung` bleibt nur als positive ganze Zahl erhalten, sonst null.
 * - `modus` fällt auf `training` zurück, wenn er fehlt oder unbekannt ist.
 * - Bahnen, die gestartet, aber nicht beendet sind, verlieren `startMs`.
 *   Bereits beendete Bahnen behalten Start und Anschläge, damit der Verlauf
 *   vollständig bleibt. `startWallMs` des Laufs wird nicht verändert, weil er
 *   als Wanduhr-Anker weiterhin gültig ist.
 *
 * Die Funktion ist rein und verändert den übergebenen Lauf nicht.
 */
export function normalizeOnLoad(lauf: Lauf): Lauf {
  const startversatzMs = Number.isFinite(lauf.startversatzMs)
    ? Math.max(0, Math.round(lauf.startversatzMs))
    : 0
  // Nur echte, positive Wiederholungsnummern bleiben stehen; alles andere
  // (fehlend, 0, Bruchzahl) bedeutet: kein Teil einer Serie.
  const wiederholung =
    Number.isInteger(lauf.wiederholung) && (lauf.wiederholung ?? 0) > 0
      ? lauf.wiederholung
      : null
  // Eine Bahn mit Start, aber ohne Finish-Anschlag gilt als abgebrochen bzw.
  // durch den Reload ungültig. Die Anschläge selbst bleiben erhalten.
  // Ältere Läufe kennen keine Reihen; ihre Bahnen gehören zu Reihe 1.
  const bahnen = lauf.bahnen.map((bahn) =>
    bahn.startMs !== null && !isFinished(bahn)
      ? { ...bahn, reihe: bahnReihe(bahn), startMs: null }
      : { ...bahn, reihe: bahnReihe(bahn) },
  )
  return {
    ...lauf,
    startversatzMs,
    wiederholung,
    modus: lauf.modus === 'wettkampf' ? 'wettkampf' : 'training',
    bahnen,
  }
}

/**
 * Ergänzt Felder, die Sätze erst mit Serien und Wettkämpfen bekommen haben.
 * Ältere Sätze haben keinen Plan; sie bleiben frei gewachsene Sätze.
 * `wettkampfId` wird auf null gesetzt, wenn es fehlt, damit die Zuordnung
 * eindeutig „kein Wettkampf“ lautet.
 */
export function normalizeSatzOnLoad(satz: Satz): Satz {
  return {
    ...satz,
    plan: satz.plan ?? null,
    wettkampfId: satz.wettkampfId ?? null,
  }
}

/** Ältere Wettkämpfe gibt es nicht; fehlende Felder werden defensiv ergänzt. */
export function normalizeWettkampfOnLoad(wettkampf: Wettkampf): Wettkampf {
  return {
    ...wettkampf,
    // Nur 25 und 50 sind gültige Beckenlängen; alles andere fällt auf 50 zurück.
    beckenlaengeM: wettkampf.beckenlaengeM === 25 ? 25 : 50,
  }
}

/**
 * Trainings sind neuer als der Bestand. Fehlende Felder werden so ergänzt, dass
 * ein Training aus einem älteren oder unvollständigen Backup nutzbar bleibt.
 *
 * Die Bahnenzahl wird auf 1 bis `MAX_BAHNEN` je Reihe und die Reihenzahl auf
 * 1 bis `MAX_REIHEN` begrenzt. Ältere Trainings kennen keine Reihen und gelten
 * als eine Reihe. Die Aktivenliste wird auf genau `bahnen × reihen` gebracht:
 * vorhandene Einträge bleiben, fehlende werden mit null („ohne Zuordnung“)
 * aufgefüllt, überzählige abgeschnitten. `saetze` und `gestartet` werden zu
 * leeren Containern, wenn sie fehlen oder falsch typisiert sind.
 */
export function normalizeTrainingOnLoad(training: Training): Training {
  // Unbekannte oder fehlende Bahnen- bzw. Reihenzahl auf den gültigen Bereich
  // begrenzen, damit die Aktivenliste darunter eine feste Länge hat.
  const bahnen = Math.min(
    MAX_BAHNEN,
    Math.max(1, Number.isInteger(training.bahnen) ? training.bahnen : 1),
  )
  const reihen = Math.min(
    MAX_REIHEN,
    Math.max(1, Number.isInteger(training.reihen) ? training.reihen : 1),
  )
  return {
    ...training,
    bezeichnung: training.bezeichnung ?? '',
    bahnen,
    reihen,
    // Genau ein Eintrag je Person; fehlende Zuordnungen werden null.
    aktive: Array.from(
      { length: bahnenGesamt(bahnen, reihen) },
      (_, index) => training.aktive?.[index] ?? null,
    ),
    saetze: Array.isArray(training.saetze) ? training.saetze : [],
    // `gestartet` ist die Zuordnung TrainingsSatz.id → Satz.id. Ein fehlender
    // oder falscher Wert wird zu einem leeren Objekt.
    gestartet:
      training.gestartet && typeof training.gestartet === 'object' ? training.gestartet : {},
  }
}

/**
 * Liest alle fünf Bestände und liefert sie normalisiert und sortiert.
 *
 * Die Stores werden parallel gelesen; die Sortierung passiert anschließend im
 * Speicher, nicht über die Indizes. Sortierreihenfolge:
 * - Schwimmer nach Name (deutsche Kollation),
 * - Sätze nach Datum absteigend (neueste zuerst),
 * - Wettkämpfe und Trainings nach Datum absteigend, bei gleichem Tag nach
 *   `erstelltAm` absteigend,
 * - Läufe in der Reihenfolge, in der IndexedDB sie liefert; ihre Sortierung
 *   übernimmt die jeweilige Ansicht.
 *
 * Fehler von IndexedDB werden unverändert weitergereicht.
 */
export async function loadAll(): Promise<{
  schwimmer: Schwimmer[]
  satze: Satz[]
  laeufe: Lauf[]
  wettkampfe: Wettkampf[]
  trainings: Training[]
}> {
  const db = await getDb()
  const [schwimmer, satze, laeufe, wettkampfe, trainings] = await Promise.all([
    db.getAll('schwimmer'),
    db.getAll('satz'),
    db.getAll('lauf'),
    db.getAll('wettkampf'),
    db.getAll('training'),
  ])
  return {
    schwimmer: schwimmer.sort((a, b) => a.name.localeCompare(b.name, 'de')),
    satze: satze.map(normalizeSatzOnLoad).sort((a, b) => b.datum.localeCompare(a.datum)),
    laeufe: laeufe.map(normalizeOnLoad),
    wettkampfe: wettkampfe
      .map(normalizeWettkampfOnLoad)
      .sort((a, b) => b.datum.localeCompare(a.datum) || b.erstelltAm - a.erstelltAm),
    trainings: trainings
      .map(normalizeTrainingOnLoad)
      .sort((a, b) => b.datum.localeCompare(a.datum) || b.erstelltAm - a.erstelltAm),
  }
}

/**
 * Schreibt einen Lauf als Upsert (Schlüssel ist `lauf.id`).
 * Der Aufrufer speichert damit jeden Anschlag sofort; ein Fehler wird als
 * abgelehntes Promise gemeldet.
 */
export async function saveLauf(lauf: Lauf): Promise<void> {
  const db = await getDb()
  await db.put('lauf', lauf)
}

/**
 * Löscht genau einen Lauf. Zugehörige Sätze bleiben bestehen; für das Löschen
 * eines ganzen Satzes siehe `deleteSatzUndLaeufe`.
 */
export async function deleteLauf(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('lauf', id)
}

/** Schreibt einen Satz als Upsert (Schlüssel ist `satz.id`). */
export async function saveSatz(satz: Satz): Promise<void> {
  const db = await getDb()
  await db.put('satz', satz)
}

/**
 * Löscht nur den Satz. Läufe, die auf ihn verweisen, würden verwaisen; deshalb
 * nur für Sätze ohne Läufe verwenden bzw. `deleteSatzUndLaeufe` bevorzugen.
 */
export async function deleteSatz(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('satz', id)
}

/**
 * Löscht einen Satz samt seiner Läufe in einer Transaktion.
 *
 * Zuerst werden die Lauf-IDs über den Index `by-satz` ermittelt, dann die Läufe
 * und zuletzt der Satz gelöscht. Die Reihenfolge (Kinder vor Eltern) vermeidet
 * verwaiste Läufe; die gemeinsame Transaktion macht das Ergebnis zusätzlich
 * ganz oder gar nicht.
 */
export async function deleteSatzUndLaeufe(id: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['satz', 'lauf'], 'readwrite')
  const laufIds = await tx.objectStore('lauf').index('by-satz').getAllKeys(id)
  for (const laufId of laufIds) {
    await tx.objectStore('lauf').delete(laufId)
  }
  await tx.objectStore('satz').delete(id)
  // Erst mit `tx.done` ist der Commit abgeschlossen; vorher ist nichts sichtbar.
  await tx.done
}

/** Schreibt einen Wettkampf als Upsert (Schlüssel ist `wettkampf.id`). */
export async function saveWettkampf(wettkampf: Wettkampf): Promise<void> {
  const db = await getDb()
  await db.put('wettkampf', wettkampf)
}

/**
 * Löscht einen Wettkampf samt aller Disziplinen und Läufe.
 *
 * Die Disziplinen sind Sätze mit passender `wettkampfId`; sie werden über den
 * Index `by-wettkampf` gefunden. Pro Disziplin werden zuerst die Läufe (Index
 * `by-satz`) und dann der Satz gelöscht, zum Schluss der Wettkampf selbst.
 * Alles läuft in einer Transaktion, damit kein halb gelöschter Wettkampf
 * zurückbleibt. Sätze älterer Stände ohne `wettkampfId` sind nicht betroffen.
 */
export async function deleteWettkampfUndDaten(id: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['wettkampf', 'satz', 'lauf'], 'readwrite')
  const satzIds = await tx.objectStore('satz').index('by-wettkampf').getAllKeys(id)
  for (const satzId of satzIds) {
    const laufIds = await tx.objectStore('lauf').index('by-satz').getAllKeys(satzId)
    for (const laufId of laufIds) {
      await tx.objectStore('lauf').delete(laufId)
    }
    await tx.objectStore('satz').delete(satzId)
  }
  await tx.objectStore('wettkampf').delete(id)
  await tx.done
}

/** Schreibt ein Training als Upsert (Schlüssel ist `training.id`). */
export async function saveTraining(training: Training): Promise<void> {
  const db = await getDb()
  await db.put('training', training)
}

/** Löscht nur den Plan. Bereits gemessene Sätze und Läufe bleiben im Verlauf. */
export async function deleteTraining(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('training', id)
}

/** Schreibt einen Schwimmer als Upsert (Schlüssel ist `schwimmer.id`). */
export async function saveSchwimmer(schwimmer: Schwimmer): Promise<void> {
  const db = await getDb()
  await db.put('schwimmer', schwimmer)
}

/**
 * Löscht einen Schwimmer. Verweise in Läufen (`schwimmerId`) und Trainings
 * (`aktive`) werden nicht mitgelöscht; Ansichten und CSV-Export lassen den
 * Namen dann leer, bis die Bahn neu zugeordnet wird.
 */
export async function deleteSchwimmer(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('schwimmer', id)
}

/**
 * Baut ein vollständiges Backup aus dem aktuellen Bestand.
 *
 * Der Inhalt entspricht `loadAll()` und ist damit bereits normalisiert und
 * sortiert. `exportiertAm` ist ein UTC-Zeitstempel (ISO 8601); Format und
 * Version kommen aus `backup.ts`, damit Export und Prüfung dieselben Konstanten
 * verwenden.
 */
export async function exportBackup(): Promise<Backup> {
  const data = await loadAll()
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportiertAm: new Date().toISOString(),
    ...data,
  }
}

/**
 * Schreibt ein geprüftes Backup ganz oder gar nicht. Die Prüfung läuft auch
 * hier noch einmal, damit kein Aufrufer die Validierung überspringen kann.
 *
 * Verhalten:
 * - Ungültige Daten führen vor dem Öffnen der Transaktion zu einem Fehler mit
 *   der Meldung aus `pruefeBackup`; der Bestand bleibt unverändert.
 * - Geschrieben wird per `put`, also als Upsert. Vorhandene Datensätze mit
 *   gleicher `id` werden überschrieben, andere bleiben erhalten; das Backup
 *   ersetzt den Bestand nicht.
 * - Reihenfolge: erst Schwimmer, Wettkämpfe und Trainings, dann Sätze, zuletzt
 *   Läufe. So existieren die Bezugsobjekte, bevor abhängige Daten geschrieben
 *   werden.
 * - Jeder Datensatz wird beim Schreiben normalisiert, damit auch ein älteres
 *   Backup die aktuellen Felder erhält.
 * - Alle Stores liegen in einer Transaktion. Ein Fehler beim Schreiben bricht
 *   sie ab; IndexedDB rollt dann sämtliche Änderungen zurück.
 */
export async function importBackup(roh: unknown): Promise<void> {
  const pruefung = pruefeBackup(roh)
  if (!pruefung.ok) throw new Error(pruefung.fehler)
  const backup = pruefung.backup

  const db = await getDb()
  const tx = db.transaction(['schwimmer', 'satz', 'lauf', 'wettkampf', 'training'], 'readwrite')
  try {
    for (const schwimmer of backup.schwimmer) {
      await tx.objectStore('schwimmer').put(schwimmer)
    }
    for (const wettkampf of backup.wettkampfe) {
      await tx.objectStore('wettkampf').put(normalizeWettkampfOnLoad(wettkampf))
    }
    for (const training of backup.trainings) {
      await tx.objectStore('training').put(normalizeTrainingOnLoad(training))
    }
    for (const satz of backup.satze) {
      await tx.objectStore('satz').put(normalizeSatzOnLoad(satz))
    }
    for (const lauf of backup.laeufe) {
      await tx.objectStore('lauf').put(normalizeOnLoad(lauf))
    }
    await tx.done
  } catch (fehler) {
    // Ein Fehler bricht die Transaktion ab; es wurde nichts teilweise geschrieben.
    throw fehler
  }
}

/**
 * Leert alle fünf Stores in einer Transaktion („Alles löschen“ in den
 * Einstellungen). Die Aufrufe laufen parallel, der Commit wird über `tx.done`
 * abgewartet; bei einem Fehler bleibt der bisherige Bestand erhalten.
 */
export async function clearAll(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['schwimmer', 'satz', 'lauf', 'wettkampf', 'training'], 'readwrite')
  await Promise.all([
    tx.objectStore('schwimmer').clear(),
    tx.objectStore('satz').clear(),
    tx.objectStore('lauf').clear(),
    tx.objectStore('wettkampf').clear(),
    tx.objectStore('training').clear(),
    tx.done,
  ])
}
