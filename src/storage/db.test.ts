/**
 * Verbindungsaufbau und Übernahme aus der früheren Datenbank.
 *
 * Prüft die nicht destruktive Migration: Eine bestehende Datenbank
 * `beckenrand` wird einmalig in den Namensraum `beckenrand.v2` kopiert, ohne
 * verändert oder gelöscht zu werden. Eine bereits gefüllte neue Datenbank wird
 * nie überschrieben. Schlägt die Übernahme fehl, arbeitet die App mit der
 * alten Datenbank weiter, statt einen leeren Bestand zu zeigen.
 *
 * `fake-indexeddb/auto` ersetzt die globale Implementierung. Jeder Fall bekommt
 * über `vi.resetModules()` ein frisches `db.ts`, weil das Verbindungs-Promise
 * modulweit festgehalten wird. Die Testverbindungen werden immer geschlossen,
 * damit `deleteDatabase` im nächsten `beforeEach` nicht blockiert. Die
 * jsdom-Umgebung liefert den `localStorage` für den Migrations-Merker.
 */
// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DATENBANK_NAME, LEGACY_DATENBANK_NAME, speicherSchluessel } from './namensraum'

const STORES = ['schwimmer', 'satz', 'lauf', 'training'] as const

/** Legt eine Datenbank mit dem aktuellen Schema an (nur für Testdaten). */
function oeffneMitSchema(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const anfrage = indexedDB.open(name, 3)
    anfrage.onupgradeneeded = () => {
      for (const store of STORES) {
        if (!anfrage.result.objectStoreNames.contains(store)) {
          anfrage.result.createObjectStore(store, { keyPath: 'id' })
        }
      }
    }
    anfrage.onsuccess = () => resolve(anfrage.result)
    anfrage.onerror = () => reject(anfrage.error)
  })
}

/** Schreibt einen Datensatz und wartet auf den Commit. */
function schreibe(
  db: IDBDatabase,
  store: string,
  wert: unknown,
  schluessel?: IDBValidKey,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    if (schluessel === undefined) tx.objectStore(store).put(wert as never)
    else tx.objectStore(store).put(wert as never, schluessel)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Leert einen Store und wartet auf den Commit (simuliert `clearAll`). */
function leere(db: IDBDatabase, store: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Liest alle Datensätze eines Stores. */
function lese(db: IDBDatabase, store: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const anfrage = db.transaction(store, 'readonly').objectStore(store).getAll()
    anfrage.onsuccess = () => resolve(anfrage.result)
    anfrage.onerror = () => reject(anfrage.error)
  })
}

function loesche(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const anfrage = indexedDB.deleteDatabase(name)
    anfrage.onsuccess = () => resolve()
    anfrage.onerror = () => reject(anfrage.error)
    anfrage.onblocked = () => reject(new Error(`Löschen von "${name}" blockiert`))
  })
}

const ANNA = { id: 'sw1', name: 'Anna', jahrgang: 2010, notiz: '', erstelltAm: 1 }

async function ladeDb() {
  vi.resetModules()
  const { getDb } = await import('./db')
  return getDb()
}

beforeEach(async () => {
  localStorage.clear()
  await loesche(DATENBANK_NAME)
  await loesche(LEGACY_DATENBANK_NAME)
})

describe('getDb', () => {
  it('öffnet die namensraumgebundene Datenbank mit dem aktuellen Schema', async () => {
    const db = await ladeDb()
    try {
      expect(db.name).toBe(DATENBANK_NAME)
      expect(db.version).toBe(3)
      expect([...db.objectStoreNames].sort()).toEqual([...STORES].sort())
      await expect(db.count('schwimmer')).resolves.toBe(0)
    } finally {
      db.close()
    }
  })

  it('übernimmt den Bestand der früheren Datenbank und lässt sie unverändert', async () => {
    const alt = await oeffneMitSchema(LEGACY_DATENBANK_NAME)
    await schreibe(alt, 'schwimmer', ANNA)
    alt.close()

    const db = await ladeDb()
    try {
      expect(db.name).toBe(DATENBANK_NAME)
      await expect(db.getAll('schwimmer')).resolves.toEqual([ANNA])
    } finally {
      db.close()
    }

    const altWieder = await oeffneMitSchema(LEGACY_DATENBANK_NAME)
    try {
      await expect(lese(altWieder, 'schwimmer')).resolves.toEqual([ANNA])
    } finally {
      altWieder.close()
    }
  })

  it('überschreibt eine bereits gefüllte neue Datenbank nicht', async () => {
    const neu = await oeffneMitSchema(DATENBANK_NAME)
    const NEU = { id: 'sw2', name: 'Neu', jahrgang: 2011, notiz: '', erstelltAm: 2 }
    await schreibe(neu, 'schwimmer', NEU)
    neu.close()

    const alt = await oeffneMitSchema(LEGACY_DATENBANK_NAME)
    await schreibe(alt, 'schwimmer', ANNA)
    alt.close()

    const db = await ladeDb()
    try {
      await expect(db.getAll('schwimmer')).resolves.toEqual([NEU])
    } finally {
      db.close()
    }
  })

  // Nach einer erfolgreichen Übernahme bleibt der Merker gesetzt. „Alle Daten
  // löschen“ leert die neue Datenbank; der alte Bestand darf nicht erneut
  // importiert werden.
  it('holt nach dem Leeren der neuen Datenbank den alten Bestand nicht zurück', async () => {
    const alt = await oeffneMitSchema(LEGACY_DATENBANK_NAME)
    await schreibe(alt, 'schwimmer', ANNA)
    alt.close()

    const db = await ladeDb()
    await expect(db.getAll('schwimmer')).resolves.toEqual([ANNA])
    db.close()

    const leer = await oeffneMitSchema(DATENBANK_NAME)
    await leere(leer, 'schwimmer')
    leer.close()

    const wieder = await ladeDb()
    try {
      await expect(wieder.count('schwimmer')).resolves.toBe(0)
    } finally {
      wieder.close()
    }
  })

  // Ein unbrauchbarer Datensatz lässt die Übernahme scheitern. Die Transaktion
  // wird zurückgerollt, die App öffnet die alte Datenbank als Rückfall und
  // nichts geht verloren.
  it('arbeitet bei fehlgeschlagener Übernahme mit der alten Datenbank weiter', async () => {
    const warnung = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const alt = await new Promise<IDBDatabase>((resolve, reject) => {
      const anfrage = indexedDB.open(LEGACY_DATENBANK_NAME, 3)
      anfrage.onupgradeneeded = () => {
        // Absichtlich ohne keyPath: Der Datensatz hat keine `id`, die neue
        // Datenbank verlangt sie und bricht die Übernahme ab.
        anfrage.result.createObjectStore('schwimmer')
      }
      anfrage.onsuccess = () => resolve(anfrage.result)
      anfrage.onerror = () => reject(anfrage.error)
    })
    await schreibe(alt, 'schwimmer', {}, 'ohne-id')
    alt.close()

    const db = await ladeDb()
    try {
      expect(db.name).toBe(LEGACY_DATENBANK_NAME)
      await expect(db.getAll('schwimmer')).resolves.toEqual([{}])
    } finally {
      db.close()
    }
    expect(warnung).toHaveBeenCalled()
    warnung.mockRestore()
    // Kein Merker: Der nächste Start versucht die Übernahme erneut.
    expect(localStorage.getItem(speicherSchluessel('migration'))).toBeNull()

    // Nichts wurde halb übernommen: Die neue Datenbank ist weiterhin leer und
    // ein späterer Start kann die Übernahme erneut versuchen.
    const neu = await oeffneMitSchema(DATENBANK_NAME)
    try {
      await expect(lese(neu, 'schwimmer')).resolves.toEqual([])
    } finally {
      neu.close()
    }
  })
})
