import { getDb } from './db'
import type { Lauf, Satz, Schwimmer } from '../domain/types'
import { isFinished } from '../domain/lauf'
import { BACKUP_FORMAT, BACKUP_VERSION, pruefeBackup, type Backup } from './backup'

/**
 * Ein Lauf überlebt einen App-Neustart nur als Historie: `performance.now()` ist
 * nach dem Reload wertlos. Laufende und geplante Bahnen werden deshalb auf
 * "nicht gestartet" zurückgesetzt, damit keine unsinnigen Zeiten entstehen.
 * Ältere Datensätze kennen Startversatz und Wiederholung noch nicht.
 */
export function normalizeOnLoad(lauf: Lauf): Lauf {
  const startversatzMs = Number.isFinite(lauf.startversatzMs)
    ? Math.max(0, Math.round(lauf.startversatzMs))
    : 0
  const wiederholung =
    Number.isInteger(lauf.wiederholung) && (lauf.wiederholung ?? 0) > 0
      ? lauf.wiederholung
      : null
  const bahnen = lauf.bahnen.map((bahn) =>
    bahn.startMs !== null && !isFinished(bahn) ? { ...bahn, startMs: null } : bahn,
  )
  return { ...lauf, startversatzMs, wiederholung, bahnen }
}

/** Ältere Sätze haben keinen Plan; sie bleiben frei gewachsene Sätze. */
export function normalizeSatzOnLoad(satz: Satz): Satz {
  return { ...satz, plan: satz.plan ?? null }
}

export async function loadAll(): Promise<{
  schwimmer: Schwimmer[]
  satze: Satz[]
  laeufe: Lauf[]
}> {
  const db = await getDb()
  const [schwimmer, satze, laeufe] = await Promise.all([
    db.getAll('schwimmer'),
    db.getAll('satz'),
    db.getAll('lauf'),
  ])
  return {
    schwimmer: schwimmer.sort((a, b) => a.name.localeCompare(b.name, 'de')),
    satze: satze.map(normalizeSatzOnLoad).sort((a, b) => b.datum.localeCompare(a.datum)),
    laeufe: laeufe.map(normalizeOnLoad),
  }
}

export async function saveLauf(lauf: Lauf): Promise<void> {
  const db = await getDb()
  await db.put('lauf', lauf)
}

export async function deleteLauf(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('lauf', id)
}

export async function saveSatz(satz: Satz): Promise<void> {
  const db = await getDb()
  await db.put('satz', satz)
}

export async function deleteSatz(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('satz', id)
}

/** Löscht einen Satz samt seiner Läufe in einer Transaktion. */
export async function deleteSatzUndLaeufe(id: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['satz', 'lauf'], 'readwrite')
  const laufIds = await tx.objectStore('lauf').index('by-satz').getAllKeys(id)
  for (const laufId of laufIds) {
    await tx.objectStore('lauf').delete(laufId)
  }
  await tx.objectStore('satz').delete(id)
  await tx.done
}

export async function saveSchwimmer(schwimmer: Schwimmer): Promise<void> {
  const db = await getDb()
  await db.put('schwimmer', schwimmer)
}

export async function deleteSchwimmer(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('schwimmer', id)
}

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
 */
export async function importBackup(roh: unknown): Promise<void> {
  const pruefung = pruefeBackup(roh)
  if (!pruefung.ok) throw new Error(pruefung.fehler)
  const backup = pruefung.backup

  const db = await getDb()
  const tx = db.transaction(['schwimmer', 'satz', 'lauf'], 'readwrite')
  try {
    for (const schwimmer of backup.schwimmer) {
      await tx.objectStore('schwimmer').put(schwimmer)
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

export async function clearAll(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['schwimmer', 'satz', 'lauf'], 'readwrite')
  await Promise.all([
    tx.objectStore('schwimmer').clear(),
    tx.objectStore('satz').clear(),
    tx.objectStore('lauf').clear(),
    tx.done,
  ])
}
