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
 * - `loadAll` liest alle vier Stores in einer gemeinsamen Read-Transaktion,
 *   damit Start, Tab-Übergabe und Import-Vorschau denselben Snapshot sehen.
 * - Schreiben ist ein Upsert über die jeweilige `id`.
 */
import { getDb } from './db'
import type { Bahn, Lauf, Satz, Schwimmer, Training } from '../domain/types'
import { MAX_BAHNEN, MAX_REIHEN, bahnenGesamt } from '../domain/training'
import { bahnReihe, isFinished } from '../domain/lauf'
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  ermittleBackupKonflikte,
  loeseBackupKonflikte,
  pruefeBackup,
  type Backup,
  type BackupBestand,
  type BackupKonflikte,
  type KonfliktAufloesung,
} from './backup'

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
 * - Bahnen, die gestartet, aber nicht beendet sind, verlieren `startMs`.
 *   Bereits beendete Bahnen behalten Start und Anschläge, damit der Verlauf
 *   vollständig bleibt. `startWallMs` des Laufs wird nicht verändert, weil er
 *   als Wanduhr-Anker weiterhin gültig ist.
 *
 * `behalteLaufende` ist für die Übergabe an einen anderen Tab gedacht: Dort
 * lebt die Messung weiter und wird anschließend über `rebaseLauf` auf die
 * monotone Uhr des neuen Dokuments verschoben. Ohne Wanduhr-Anker bleibt es
 * beim Zurücksetzen, weil sich der Start dann nicht verlässlich umrechnen
 * lässt.
 *
 * Die Funktion ist rein und verändert den übergebenen Lauf nicht.
 */
export function normalizeOnLoad(
  lauf: Lauf,
  optionen: { behalteLaufende?: boolean } = {},
): Lauf {
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
  // Ohne Wanduhr-Anker lässt sich ein laufender Start nicht auf ein anderes
  // Dokument übertragen; dann gilt weiterhin die Reload-Regel.
  const behalteLaufende = optionen.behalteLaufende === true && lauf.startWallMs !== null
  const bahnen = lauf.bahnen.map((bahn) => {
    // Alte Wettkampf-Felder werden beim Laden verworfen. Gestartete, aber
    // offene Bahnen verlieren ihre Startzeit; bei einer Tab-Übergabe bleibt der
    // Start erhalten und wird später auf die neue Zeitbasis verschoben.
    const rest = { ...bahn } as Bahn & { status?: unknown }
    delete rest.status
    const startMs =
      bahn.startMs !== null && !isFinished(bahn) && !behalteLaufende ? null : bahn.startMs
    return { ...rest, reihe: bahnReihe(bahn), startMs }
  })
  const ohneModus = { ...lauf } as Lauf & { modus?: unknown }
  delete ohneModus.modus
  return {
    ...ohneModus,
    startversatzMs,
    wiederholung,
    bahnen,
  }
}

/**
 * Ergänzt Felder, die Sätze erst mit Serien bekommen haben. Ältere Sätze haben
 * keinen Plan; sie bleiben frei gewachsene Sätze. Ein altes `wettkampfId` wird
 * verworfen. Der Tagesname ist optional; ein fehlender oder unbrauchbarer Wert
 * wird zu einem leeren Text, damit alle Sätze desselben Tages vergleichbar
 * bleiben.
 */
export function normalizeSatzOnLoad(satz: Satz): Satz {
  const rest = { ...satz } as Satz & { wettkampfId?: unknown }
  delete rest.wettkampfId
  return {
    ...rest,
    plan: satz.plan ?? null,
    tagesbezeichnung:
      typeof satz.tagesbezeichnung === 'string' ? satz.tagesbezeichnung : '',
  }
}

/**
 * Trainings sind neuer als der Bestand. Fehlende Felder werden so ergänzt, dass
 * ein Training aus einem älteren oder unvollständigen Backup nutzbar bleibt.
 *
 * Die Bahnenzahl wird auf 1 bis `MAX_BAHNEN` je Reihe und die Reihenzahl auf
 * 1 bis `MAX_REIHEN` begrenzt. Ältere Trainings kennen keine Reihen und gelten
 * als eine Reihe. `autostart` fehlt in älteren Trainings und gilt dann als
 * `false`; nur ein ausdrückliches `true` startet Sätze automatisch. Die
 * Aktivenliste wird auf genau `bahnen × reihen` gebracht:
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
    // Ältere Trainings kennen keinen automatischen Satzwechsel und bleiben
    // beim bewussten Start des nächsten Satzes.
    autostart: training.autostart === true,
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
 * Liest alle vier Bestände und liefert sie normalisiert und sortiert.
 *
 * Alle Stores werden in genau einer `readonly`-Transaktion gelesen. IndexedDB
 * legt deren Snapshot beim Öffnen fest; ein Commit während des Lesens ist damit
 * entweder vollständig sichtbar oder gar nicht. Die Rückgabe entsteht erst
 * nach `tx.done`, also nach dem Ende der Transaktion. Die Sortierung passiert
 * anschließend im Speicher, nicht über die Indizes. Sortierreihenfolge:
 * - Schwimmer nach Name (deutsche Kollation),
 * - Sätze nach Datum absteigend (neueste zuerst),
 * - Trainings nach Datum absteigend, bei gleichem Tag nach `erstelltAm`
 *   absteigend,
 * - Läufe in der Reihenfolge, in der IndexedDB sie liefert; ihre Sortierung
 *   übernimmt die jeweilige Ansicht.
 *
 * Fehler von IndexedDB werden unverändert weitergereicht.
 */
export async function loadAll(optionen: { behalteLaufende?: boolean } = {}): Promise<{
  schwimmer: Schwimmer[]
  satze: Satz[]
  laeufe: Lauf[]
  trainings: Training[]
}> {
  const db = await getDb()
  const tx = db.transaction(['schwimmer', 'satz', 'lauf', 'training'], 'readonly')
  // Sammelt die bereits gestarteten Reads, damit ein späterer Fehler ihre
  // Ablehnungen einsammeln kann, statt sie unbehandelt zu lassen.
  const anfragen: Promise<unknown>[] = []
  const lese = <T>(anfrage: () => Promise<T>): Promise<T> => {
    const ergebnis = anfrage()
    anfragen.push(ergebnis)
    return ergebnis
  }
  try {
    // Die Reads laufen parallel innerhalb derselben Transaktion. Ein Store
    // kann nicht aus einem neueren Stand stammen als die übrigen.
    const [schwimmer, satze, laeufe, trainings] = await Promise.all([
      lese(() => tx.objectStore('schwimmer').getAll()),
      lese(() => tx.objectStore('satz').getAll()),
      lese(() => tx.objectStore('lauf').getAll()),
      lese(() => tx.objectStore('training').getAll()),
    ])
    // Erst nach dem Abschluss ist der Snapshot vollständig gelesen. Vorher
    // könnten noch Requests offen sein, etwa wenn ein Fehler die Transaktion
    // abbricht.
    await tx.done
    return {
      schwimmer: schwimmer.sort((a, b) => a.name.localeCompare(b.name, 'de')),
      satze: satze.map(normalizeSatzOnLoad).sort((a, b) => b.datum.localeCompare(a.datum)),
      laeufe: laeufe.map((lauf) => normalizeOnLoad(lauf, optionen)),
      trainings: trainings
        .map(normalizeTrainingOnLoad)
        .sort((a, b) => b.datum.localeCompare(a.datum) || b.erstelltAm - a.erstelltAm),
    }
  } catch (fehler) {
    // Ein abgebrochener Read hinterlässt eine beendete Transaktion; ein
    // späteres `abort` ist dann ein No-op. Das Abwarten von `tx.done` verhindert
    // eine unbehandelte Ablehnung, der ursprüngliche Fehler bleibt erhalten.
    try {
      tx.abort()
    } catch {
      // Bereits abgeschlossen oder abgebrochen.
    }
    await tx.done.catch(() => undefined)
    // Abgebrochene Reads melden sich mit `AbortError`; das ist Folge des
    // ursprünglichen Fehlers und darf nicht als unbehandelte Ablehnung enden.
    await Promise.allSettled(anfragen)
    throw fehler
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

/** Mehrere Datensätze, die gemeinsam geschrieben werden sollen. */
export interface SpeicherBatch {
  schwimmer?: Schwimmer[]
  satze?: Satz[]
  laeufe?: Lauf[]
  trainings?: Training[]
}

/**
 * Schreibt mehrere Datensätze in genau einer Transaktion.
 *
 * Gedacht für Aktionen, die fachlich zusammengehören: etwa ein gestarteter
 * Trainingssatz mit seinen Läufen. Entweder ist danach alles sichtbar oder
 * nichts; ein Abbruch mitten im
 * Schreibvorgang hinterlässt keinen halben Import. Die Reihenfolge entspricht
 * `importBackup`: Bezugsobjekte vor abhängigen Datensätzen.
 */
export async function saveMehrere(batch: SpeicherBatch): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['schwimmer', 'satz', 'lauf', 'training'], 'readwrite')
  try {
    for (const schwimmer of batch.schwimmer ?? []) {
      await tx.objectStore('schwimmer').put(schwimmer)
    }
    for (const training of batch.trainings ?? []) {
      await tx.objectStore('training').put(training)
    }
    for (const satz of batch.satze ?? []) {
      await tx.objectStore('satz').put(satz)
    }
    for (const lauf of batch.laeufe ?? []) {
      await tx.objectStore('lauf').put(lauf)
    }
    await tx.done
  } catch (fehler) {
    // Auch ein synchroner Fehler (etwa ein nicht klonbarer Wert) muss die
    // bereits geschriebenen Datensätze zurückrollen. Ohne `abort` könnte die
    // Transaktion mit einem Teilstand committen.
    try {
      tx.abort()
    } catch {
      // Bereits abgebrochen oder committet.
    }
    await tx.done.catch(() => undefined)
    throw fehler
  }
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
 * Bringt die Datensätze eines geprüften Backups auf die Form, die auch beim
 * Schreiben in der Datenbank landet.
 *
 * Konfliktvergleich und Import bewerten damit denselben Stand: Ein älteres
 * Backup ohne `startversatzMs`, `plan` oder `modus` gilt nicht schon deshalb
 * als abweichend, weil diese Felder fehlen. Die Eingabe bleibt unverändert.
 */
export function normalisiereBackup(bestand: BackupBestand): BackupBestand {
  return {
    schwimmer: bestand.schwimmer,
    trainings: bestand.trainings.map(normalizeTrainingOnLoad),
    satze: bestand.satze.map(normalizeSatzOnLoad),
    laeufe: bestand.laeufe.map((lauf) => normalizeOnLoad(lauf)),
  }
}

/** Optionen für `importBackup`. */
export interface ImportOptionen {
  /**
   * Wie mit Kollisionen umgegangen wird. Standard ist `lokalBehalten`: Ein
   * vorhandener Datensatz mit derselben ID wird nicht überschrieben.
   */
  konflikte?: KonfliktAufloesung
}

/**
 * Schreibt ein geprüftes Backup ganz oder gar nicht. Die Prüfung läuft auch
 * hier noch einmal, damit kein Aufrufer die Validierung überspringen kann.
 *
 * Verhalten:
 * - Ungültige Daten führen vor dem Öffnen der Transaktion zu einem Fehler mit
 *   der Meldung aus `pruefeBackup`; der Bestand bleibt unverändert.
 * - Kollidierende IDs werden erkannt: Ein vorhandener Datensatz mit gleicher
 *   `id` und abweichendem Inhalt ist ein Konflikt. Ohne `backupErsetzen` wird
 *   er übersprungen, damit ein älteres Backup keine neueren Messungen
 *   zurücksetzt. Die Entscheidung wird innerhalb derselben Transaktion gegen
 *   den dann gültigen Stand getroffen; die Vorschau kann also veralten, ohne
 *   Daten zu verlieren.
 * - Nicht kollidierende Datensätze werden ergänzt; das Backup ersetzt den
 *   Bestand nicht.
 * - Reihenfolge: erst Schwimmer und Trainings, dann Sätze, zuletzt Läufe. So
 *   existieren die Bezugsobjekte, bevor abhängige Daten geschrieben werden.
 * - Jeder Datensatz wird beim Schreiben normalisiert, damit auch ein älteres
 *   Backup die aktuellen Felder erhält.
 * - Alle Stores liegen in einer Transaktion. Ein Fehler beim Schreiben bricht
 *   sie ab; IndexedDB rollt dann sämtliche Änderungen zurück.
 *
 * Rückgabe: die erkannten Konflikte, damit die Oberfläche die tatsächlich
 * übersprungenen oder ersetzten Datensätze melden kann.
 */
export async function importBackup(
  roh: unknown,
  optionen: ImportOptionen = {},
): Promise<BackupKonflikte> {
  const pruefung = pruefeBackup(roh)
  if (!pruefung.ok) throw new Error(pruefung.fehler)
  const backup = pruefung.backup
  const aufloesung = optionen.konflikte ?? 'lokalBehalten'

  const db = await getDb()
  const tx = db.transaction(['schwimmer', 'satz', 'lauf', 'training'], 'readwrite')
  try {
    // Lesen und Schreiben liegen in derselben Transaktion. Der Konfliktvergleich
    // sieht damit genau den Stand, auf den geschrieben wird, und bleibt atomar.
    const [schwimmer, satze, laeufe, trainings] = await Promise.all([
      tx.objectStore('schwimmer').getAll(),
      tx.objectStore('satz').getAll(),
      tx.objectStore('lauf').getAll(),
      tx.objectStore('training').getAll(),
    ])
    const bestand = normalisiereBackup({
      schwimmer,
      satze,
      laeufe,
      trainings,
    })
    const normalisiert = normalisiereBackup(backup)
    const konflikte = ermittleBackupKonflikte(normalisiert, bestand)
    const zuSchreiben = loeseBackupKonflikte(normalisiert, konflikte.eintraege, aufloesung)

    for (const eintrag of zuSchreiben.schwimmer) {
      await tx.objectStore('schwimmer').put(eintrag)
    }
    for (const eintrag of zuSchreiben.trainings) {
      await tx.objectStore('training').put(eintrag)
    }
    for (const eintrag of zuSchreiben.satze) {
      await tx.objectStore('satz').put(eintrag)
    }
    for (const eintrag of zuSchreiben.laeufe) {
      await tx.objectStore('lauf').put(eintrag)
    }
    await tx.done
    return konflikte
  } catch (fehler) {
    // Ein Fehler bricht die Transaktion ab; es wurde nichts teilweise
    // geschrieben. `abort` deckt auch synchrone Fehler ab, die IndexedDB nicht
    // selbst als Request-Fehler behandelt.
    try {
      tx.abort()
    } catch {
      // Bereits abgebrochen oder committet.
    }
    await tx.done.catch(() => undefined)
    throw fehler
  }
}

/**
 * Leert alle vier Stores in einer Transaktion („Alles löschen“ in den
 * Einstellungen). Die Aufrufe laufen parallel, der Commit wird über `tx.done`
 * abgewartet; bei einem Fehler bleibt der bisherige Bestand erhalten.
 */
export async function clearAll(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['schwimmer', 'satz', 'lauf', 'training'], 'readwrite')
  await Promise.all([
    tx.objectStore('schwimmer').clear(),
    tx.objectStore('satz').clear(),
    tx.objectStore('lauf').clear(),
    tx.objectStore('training').clear(),
    tx.done,
  ])
}
