import { getDb } from './db'
import type { Lauf, Satz, Schwimmer } from '../domain/types'
import { isFinished } from '../domain/lauf'

/**
 * Ein Lauf überlebt einen App-Neustart nur als Historie: `performance.now()` ist
 * nach dem Reload wertlos. Laufende Bahnen werden deshalb auf "nicht gestartet"
 * zurückgesetzt, damit keine unsinnigen Zeiten entstehen.
 */
export function normalizeOnLoad(lauf: Lauf): Lauf {
  const bahnen = lauf.bahnen.map((bahn) =>
    bahn.startMs !== null && !isFinished(bahn) ? { ...bahn, startMs: null } : bahn,
  )
  return { ...lauf, bahnen }
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
    satze: satze.sort((a, b) => b.datum.localeCompare(a.datum)),
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

export async function saveSchwimmer(schwimmer: Schwimmer): Promise<void> {
  const db = await getDb()
  await db.put('schwimmer', schwimmer)
}

export async function deleteSchwimmer(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('schwimmer', id)
}

export interface Backup {
  format: 'beckenrand-backup'
  version: 1
  exportiertAm: string
  schwimmer: Schwimmer[]
  satze: Satz[]
  laeufe: Lauf[]
}

export async function exportBackup(): Promise<Backup> {
  const data = await loadAll()
  return {
    format: 'beckenrand-backup',
    version: 1,
    exportiertAm: new Date().toISOString(),
    ...data,
  }
}

export async function importBackup(backup: Backup): Promise<void> {
  if (backup.format !== 'beckenrand-backup') {
    throw new Error('Unbekanntes Dateiformat.')
  }
  const db = await getDb()
  const tx = db.transaction(['schwimmer', 'satz', 'lauf'], 'readwrite')
  await Promise.all([
    ...backup.schwimmer.map((s) => tx.objectStore('schwimmer').put(s)),
    ...backup.satze.map((s) => tx.objectStore('satz').put(s)),
    ...backup.laeufe.map((l) => tx.objectStore('lauf').put(normalizeOnLoad(l))),
    tx.done,
  ])
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
