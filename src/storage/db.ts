/**
 * IndexedDB-Schema, Verbindungsaufbau und Übernahme des alten Bestands.
 *
 * Öffnet die namensraumgebundene Datenbank (`beckenrand.v2`, siehe
 * `namensraum.ts`) genau einmal pro Tab und hält die Verbindung als Promise
 * fest. Das Schema besteht aus vier Object Stores (Schwimmer, Satz, Lauf,
 * Training), die über `id` adressiert und über Indizes für Datum und
 * Satzzuordnung erschlossen werden. Migrationen sind rein additiv: Jede
 * Schema-Version legt nur neue Stores und Indizes an, bestehende Daten werden
 * nie umgeschrieben.
 *
 * GitHub Pages teilt sich eine Origin zwischen allen Projektseiten. Der
 * Namensraum verhindert versehentliche Kollisionen, ist aber keine
 * Sicherheitsgrenze gegen fremdes JavaScript auf derselben Origin; dafür ist
 * eine eigene Domain nötig (ADR-0011).
 *
 * Bestehende Installationen liegen in der früheren Datenbank `beckenrand`.
 * Beim ersten Start mit leerer neuer Datenbank werden alle vorhandenen Stores
 * einmalig dorthin kopiert; ein Merker im `localStorage` verhindert eine
 * Wiederholung nach „Alle Daten löschen“. Die alte Datenbank bleibt
 * unangetastet: Schlägt die Übernahme fehl, öffnet die App sie direkt weiter,
 * statt mit einem leeren Bestand zu starten. Nichts wird gelöscht; ein späterer
 * Start versucht die Übernahme erneut.
 *
 * Datenfluss: `repository.ts` ist der einzige fachliche Aufrufer; alle
 * Schreib- und Lesezugriffe laufen über `getDb()`. Da IndexedDB-Verbindungen
 * tabgebunden sind, koordinieren die Callbacks `blocked`, `blocking` und
 * `terminated` das Zusammenspiel mehrerer Tabs bzw. App-Versionen.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Lauf, Satz, Schwimmer, Training } from '../domain/types'
import { DATENBANK_NAME, LEGACY_DATENBANK_NAME, speicherSchluessel } from './namensraum'

/**
 * Typschema der Datenbank.
 *
 * Jeder Eintrag beschreibt einen Object Store mit Schlüsselpfad (`key`), dem
 * gespeicherten Domänentyp (`value`) und den verfügbaren Indizes. Die Schlüssel
 * sind die `id`-Felder der Domänenobjekte, sodass ein `put` immer ein Upsert
 * auf genau diesem Datensatz ist.
 */
export interface BeckenrandDB extends DBSchema {
  schwimmer: {
    key: string
    value: Schwimmer
    indexes: { 'by-name': string }
  }
  satz: {
    key: string
    value: Satz
    // `by-datum` sortiert Sätze tagesweise.
    indexes: { 'by-datum': string }
  }
  lauf: {
    key: string
    value: Lauf
    // Läufe hängen über `satzId` an einem Satz. Der Index ersetzt eine
    // Fremdschlüsselbeziehung und wird beim Löschen eines Satzes benötigt.
    indexes: { 'by-satz': string }
  }
  training: {
    key: string
    value: Training
    indexes: { 'by-datum': string }
  }
}

/** Alle Stores in Anlage-Reihenfolge; auch die Übernahme nutzt diese Liste. */
const STORES = ['schwimmer', 'satz', 'lauf', 'training'] as const
type StoreName = (typeof STORES)[number]

// Muss bei jeder Schemaänderung erhöht werden; der `upgrade`-Callback unten
// entscheidet anhand der alten Version, welche Schritte nachzuholen sind.
const DB_VERSION = 3

// Einmal geöffnete Verbindung pro Tab. Das Promise verhindert parallele
// `openDB`-Aufrufe, die sonst mehrere Verbindungen öffnen würden.
let dbPromise: Promise<IDBPDatabase<BeckenrandDB>> | null = null

// Merker, dass die Übernahme aus der früheren Datenbank abgeschlossen ist.
// Ohne ihn würde „Alle Daten löschen“ (leert die neue Datenbank) beim nächsten
// Start den alten Bestand erneut importieren. Der Merker lebt im
// localStorage, weil er nur die App-Installation betrifft und kein
// fachlicher Datensatz ist.
const MIGRATIONS_MARKE = speicherSchluessel('migration')

function migrationIstAbgeschlossen(): boolean {
  try {
    return (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem(MIGRATIONS_MARKE) === 'fertig'
    )
  } catch {
    return false
  }
}

function merkeMigration(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(MIGRATIONS_MARKE, 'fertig')
  } catch {
    // Ohne localStorage wird beim nächsten Start erneut geprüft; die neue
    // Datenbank ist dann in der Regel bereits gefüllt und bleibt unverändert.
  }
}

/**
 * Öffnet eine Datenbank mit dem aktuellen Schema.
 *
 * Wird für die namensraumgebundene Datenbank und als Rückfall für die frühere
 * Datenbank verwendet. Der Rückfall öffnet dieselbe additive Version; ältere
 * Stände werden dabei nur um fehlende Stores erweitert.
 */
function oeffne(name: string): Promise<IDBPDatabase<BeckenrandDB>> {
  return openDB<BeckenrandDB>(name, DB_VERSION, {
    upgrade(db, alteVersion, _neueVersion, _transaction) {
      // Version 1: Grundschema aus Schwimmern, Sätzen und Läufen.
      if (alteVersion < 1) {
        const schwimmer = db.createObjectStore('schwimmer', { keyPath: 'id' })
        schwimmer.createIndex('by-name', 'name')

        const satz = db.createObjectStore('satz', { keyPath: 'id' })
        satz.createIndex('by-datum', 'datum')

        const lauf = db.createObjectStore('lauf', { keyPath: 'id' })
        lauf.createIndex('by-satz', 'satzId')
      }

      // Version 2 (Wettkämpfe) wird nicht mehr angelegt. Version 3 bleibt der
      // aktuelle Stand; bestehende Datenbanken werden nicht umgeschrieben.

      // Version 3: Trainingspläne als eigener Store. Sie hängen nicht an
      // Sätzen; erst beim Start eines Trainingssatzes entstehen Satz und Läufe.
      if (alteVersion < 3) {
        const training = db.createObjectStore('training', { keyPath: 'id' })
        training.createIndex('by-datum', 'datum')
      }
    },
    blocked(alteVersion) {
      // Tritt auf, wenn ein Tab mit einer älteren App-Version die Datenbank
      // noch offen hält. Der Aufruf wartet, bis dieser Tab geschlossen ist.
      // In der Zwischenzeit ist die App nicht schreibfähig.
      console.error(
        `Datenbank-Upgrade blockiert: Ein Tab mit Version ${alteVersion} ist noch geöffnet.`,
      )
    },
    blocking(alteVersion) {
      // Diese Verbindung verhindert das Upgrade eines neueren Tabs.
      console.warn(
        `Diese App-Version (${alteVersion}) blockiert ein Datenbank-Upgrade. Bitte diesen Tab schließen.`,
      )
    },
    terminated() {
      // Nach einem Absturz des Verbindungsprozesses neu öffnen können.
      dbPromise = null
    },
  })
}

/** Wahr, wenn in keinem Store ein Datensatz liegt. */
async function istLeer(db: IDBPDatabase<BeckenrandDB>): Promise<boolean> {
  for (const store of STORES) {
    if ((await db.count(store)) > 0) return false
  }
  return true
}

/**
 * Öffnet die frühere Datenbank nur, wenn sie bereits existiert.
 *
 * `indexedDB.open(name)` ohne Version würde eine fehlende Datenbank anlegen.
 * Ein `upgradeneeded` bedeutet hier deshalb „nicht vorhanden“; die Transaktion
 * wird abgebrochen und die Anlage damit verworfen. Eine vorhandene Datenbank
 * wird ohne Schemaänderung geöffnet.
 */
function oeffneNurWennVorhanden(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let anfrage: IDBOpenDBRequest
    try {
      anfrage = indexedDB.open(LEGACY_DATENBANK_NAME)
    } catch {
      resolve(null)
      return
    }
    anfrage.onupgradeneeded = () => {
      anfrage.transaction?.abort()
    }
    anfrage.onsuccess = () => resolve(anfrage.result)
    anfrage.onerror = () => resolve(null)
    anfrage.onblocked = () => resolve(null)
  })
}

/** Liest alle Datensätze eines Stores aus der früheren Datenbank. */
function leseStore(db: IDBDatabase, store: StoreName): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(store, 'readonly')
      const anfrage = tx.objectStore(store).getAll()
      anfrage.onsuccess = () => resolve(anfrage.result)
      anfrage.onerror = () => reject(anfrage.error)
    } catch (fehler) {
      reject(fehler)
    }
  })
}

/**
 * Kopiert den Bestand der früheren Datenbank, wenn die neue leer ist.
 *
 * Nicht destruktiv: Gelesen wird nur, geschrieben wird in die neue Datenbank;
 * die alte bleibt vollständig erhalten. Ist die neue Datenbank nicht leer,
 * wird nichts überschrieben. Fehlt die alte Datenbank oder ist auch sie leer,
 * passiert nichts.
 */
async function uebernimmAlteDatenbank(db: IDBPDatabase<BeckenrandDB>): Promise<void> {
  if (!(await istLeer(db))) return

  const alt = await oeffneNurWennVorhanden()
  if (!alt) return
  try {
    const vorhandene = STORES.filter((store) => alt.objectStoreNames.contains(store))
    if (vorhandene.length === 0) return

    const inhalt = new Map<StoreName, unknown[]>()
    for (const store of vorhandene) inhalt.set(store, await leseStore(alt, store))
    // Eine leere Alt-Datenbank ist kein Grund für eine Schreibtransaktion.
    if ([...inhalt.values()].every((liste) => liste.length === 0)) return

    const tx = db.transaction(vorhandene, 'readwrite')
    try {
      const anfragen: Array<Promise<unknown>> = []
      for (const store of vorhandene) {
        // Die Datensätze stammen aus demselben Schema; die Typunion von `idb`
        // lässt sich hier nicht auf einen einzelnen Store verengen. Die
        // Rückgaben müssen eingesammelt werden: Ein abgelehnter `put` bliebe
        // sonst als unbehandelte Rejection stehen.
        const ziel = tx.objectStore(store) as unknown as { put(wert: unknown): Promise<unknown> }
        for (const wert of inhalt.get(store) ?? []) anfragen.push(ziel.put(wert))
      }
      await Promise.all(anfragen)
      await tx.done
    } catch (fehler) {
      // Ein einzelner unbrauchbarer Datensatz darf keine halb übernommene
      // Datenbank hinterlassen; der Abbruch rollt alle Stores zurück. Die alte
      // Datenbank bleibt vollständig und wird beim nächsten Start erneut
      // versucht (oder dient sofort als Rückfall).
      try {
        tx.abort()
      } catch {
        // Bereits beendet oder abgebrochen.
      }
      // Das `done`-Promise existiert seit dem Öffnen der Transaktion; ohne
      // diesen Handler bliebe die Abbruch-Rejection unbehandelt.
      await tx.done.catch(() => undefined)
      throw fehler
    }
    console.info(
      `Bestand aus der bisherigen Datenbank "${LEGACY_DATENBANK_NAME}" übernommen; die alte Datenbank bleibt unverändert.`,
    )
  } finally {
    alt.close()
  }
}

/**
 * Öffnet die aktuelle Datenbank und übernimmt bei Bedarf den alten Bestand.
 *
 * Schlägt die Übernahme fehl, bleibt die alte Datenbank unangetastet. Die App
 * öffnet dann diese direkt weiter, damit keine Messungen unsichtbar werden;
 * beim nächsten Start wird die Übernahme erneut versucht. Der Fehler wird
 * gemeldet, nicht verschwiegen.
 */
async function oeffneAktuelleDatenbank(): Promise<IDBPDatabase<BeckenrandDB>> {
  const db = await oeffne(DATENBANK_NAME)
  try {
    // Nur einmal übernehmen. Der Merker wird auch bei leerer Alt-Datenbank
    // gesetzt, damit ein späteres „Alle Daten löschen“ nichts zurückholt.
    if (!migrationIstAbgeschlossen()) {
      await uebernimmAlteDatenbank(db)
      merkeMigration()
    }
    return db
  } catch (fehler) {
    db.close()
    console.warn(
      `Übernahme aus "${LEGACY_DATENBANK_NAME}" fehlgeschlagen; die App arbeitet vorerst mit der alten Datenbank weiter.`,
      fehler,
    )
    return oeffne(LEGACY_DATENBANK_NAME)
  }
}

/**
 * Liefert die geteilte Datenbankverbindung und öffnet sie beim ersten Aufruf.
 *
 * Der Rückgabewert ist immer dasselbe Promise, solange die Verbindung lebt.
 * Nach einem `terminated`-Ereignis wird es zurückgesetzt, sodass der nächste
 * Aufruf die Datenbank neu öffnet. Fehler beim Öffnen (z. B. blockiertes
 * Upgrade) werden über das Promise weitergereicht.
 */
export function getDb(): Promise<IDBPDatabase<BeckenrandDB>> {
  dbPromise ??= oeffneAktuelleDatenbank()
  return dbPromise
}
